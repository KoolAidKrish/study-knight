// LAN party relay, run in the host's main process.
// Every app (the host's own window included) connects here over WebSocket. The server keeps the
// roster and the latest timer snapshot, answers clock pings, and relays: host → everyone, member → host.
// The timer itself lives in the host's window; this server only passes messages along. That keeps the
// protocol the same for a future internet relay.

const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORTS = [47820, 47821, 47822, 47823, 47824];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRTUVWXY'; // no I/O/S/Z lookalikes
const MAX_MSG = 2 * 1024 * 1024;              // room for shared character packs later
const MAX_MEMBERS = 12;

let server = null;

// Addresses friends can reach, best first. Virtual adapters (WSL, Hyper-V, VirtualBox host-only)
// aren't reachable from other machines, so they're left out. Tailscale is kept and labelled.
const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|vbox|docker|Loopback/i;
function lanAddresses() {
  const rank = (name) => (/wi-?fi|wlan|wireless/i.test(name) ? 0 : /ethernet|^en|^eth/i.test(name) ? 1 : /tailscale/i.test(name) ? 3 : 2);
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, list]) => (list ?? []).map((i) => ({ ...i, name })))
    .filter((i) => i.family === 'IPv4' && !i.internal && !VIRTUAL.test(i.name) && !i.address.startsWith('192.168.56.'))
    .sort((a, b) => rank(a.name) - rank(b.name))
    .map((i) => ({ address: i.address, label: /tailscale/i.test(i.name) ? 'Tailscale' : '' }));
}

function makeCode() {
  return Array.from(crypto.randomBytes(4), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

const cleanName = (n) => String(n ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24) || 'Knight';

function listen(port) {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ port, maxPayload: MAX_MSG });
    wss.once('listening', () => resolve(wss));
    wss.once('error', reject);
  });
}

async function start() {
  if (server) return info();
  let wss = null;
  let lastErr;
  for (const port of PORTS) {
    try { wss = await listen(port); break; } catch (e) { lastErr = e; }
  }
  if (!wss) throw new Error(`Couldn't open a party port (${lastErr?.code ?? lastErr}).`);

  const state = { code: makeCode(), host: null, members: new Map(), snapshot: null, nextId: 1 };
  server = { wss, state, port: wss.address().port };

  const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const roster = () => [
    ...(state.host ? [{ id: 0, name: state.host.name, host: true }] : []),
    ...[...state.members.values()].map((m) => ({ id: m.id, name: m.name })),
  ];
  const broadcast = (msg, except) => {
    if (state.host && state.host.ws !== except) send(state.host.ws, msg);
    for (const m of state.members.values()) if (m.ws !== except) send(m.ws, msg);
  };
  const pushRoster = () => broadcast({ t: 'roster', members: roster() });

  wss.on('connection', (ws, req) => {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    let me = null;
    const hello = setTimeout(() => ws.close(4000, 'No hello'), 5000);

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;

      // Clock sync works before and after joining.
      if (msg.t === 'ping') return send(ws, { t: 'pong', id: msg.id, server: Date.now() });

      if (!me) {
        if (msg.t !== 'hello') return;
        clearTimeout(hello);
        if (String(msg.code ?? '').toUpperCase() !== state.code) return ws.close(4001, 'Wrong party code');
        if (msg.role === 'host') {
          // Only the app on this machine may take the host seat, and only once.
          if (!local || state.host) return ws.close(4003, 'Host seat taken');
          me = { id: 0, name: cleanName(msg.name), ws, host: true };
          state.host = me;
        } else {
          if (state.members.size >= MAX_MEMBERS) return ws.close(4002, 'Party is full');
          me = { id: state.nextId++, name: cleanName(msg.name), ws };
          state.members.set(me.id, me);
        }
        send(ws, { t: 'welcome', id: me.id, code: state.code, snapshot: state.snapshot, members: roster() });
        pushRoster();
        return;
      }

      if (me.host) {
        // Host → everyone. Keep the latest timer snapshot for people who join later.
        if (msg.t === 'state') state.snapshot = msg.snapshot;
        for (const m of state.members.values()) send(m.ws, msg);
      } else if (state.host) {
        // Member → host, tagged with who sent it.
        send(state.host.ws, { ...msg, from: me.id, fromName: me.name });
      }
    });

    ws.on('close', () => {
      clearTimeout(hello);
      if (!me) return;
      if (me.host) state.host = null;
      else state.members.delete(me.id);
      pushRoster();
    });
  });

  return info();
}

function info() {
  return server && { port: server.port, code: server.state.code, addresses: lanAddresses() };
}

async function stop() {
  if (!server) return;
  const { wss } = server;
  server = null;
  for (const c of wss.clients) c.close(4004, 'Host ended the party');
  await new Promise((r) => wss.close(() => r()));
}

module.exports = { start, stop, info };
