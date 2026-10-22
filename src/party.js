// Party session: one WebSocket to a relay (the host's app on the LAN today; a cloud relay could
// speak the same messages later). Handles joining, the roster and clock sync. What the messages
// mean for the timer is up to app.js.

const DEFAULT_PORTS = [47820, 47821, 47822, 47823, 47824];

// The only part that knows about WebSockets. Swap this for another transport to go beyond the LAN.
function openSocket(url, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, timeoutMs);
    ws.onopen = () => { clearTimeout(timer); resolve(ws); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('unreachable')); };
  });
}

const REASONS = {
  4001: 'Wrong party code.',
  4002: 'That party is full.',
  4003: 'Someone is already hosting from this computer.',
  4004: 'The host ended the party.',
};

export class Party extends EventTarget {
  constructor() {
    super();
    this.role = null;       // null | 'host' | 'member'
    this.ws = null;
    this.members = [];
    this.myId = null;
    this.code = '';
    this.addresses = [];
    this.port = null;
    this.offset = 0;        // relay clock − our clock, in ms
    this.leaving = false;
  }

  get active() {
    return !!this.role;
  }

  // Our clock → relay clock, and back.
  toServer(t) { return t + this.offset; }
  toLocal(t) { return t - this.offset; }

  async host(name) {
    if (!window.desktop?.party) throw new Error('Hosting needs the desktop app.');
    const info = await window.desktop.party.host();
    this.addresses = info.addresses;
    this.port = info.port;
    await this.connect([`ws://127.0.0.1:${info.port}`], { role: 'host', code: info.code, name });
  }

  async join(address, code, name) {
    const [hostPart, portPart] = String(address).trim().split(':');
    if (!hostPart) throw new Error('Enter the host’s address.');
    const ports = portPart ? [+portPart] : DEFAULT_PORTS;
    await this.connect(ports.map((p) => `ws://${hostPart}:${p}`), { role: 'member', code: code.trim().toUpperCase(), name });
  }

  async connect(urls, hello) {
    let ws = null;
    for (const url of urls) {
      try { ws = await openSocket(url); break; } catch {}
    }
    if (!ws) throw new Error('Couldn’t reach that address. Check it, and that you’re on the same network.');
    this.ws = ws;
    this.leaving = false;

    const welcome = new Promise((resolve, reject) => {
      ws.onmessage = (ev) => this.receive(ev, resolve);
      ws.onclose = (ev) => {
        const why = REASONS[ev.code] ?? (this.role ? 'Lost connection to the party.' : 'The party closed the connection.');
        if (!this.role) reject(new Error(why));
        this.drop(why);
      };
    });
    await this.syncClock();
    this.send({ t: 'hello', ...hello });
    const w = await welcome;
    this.role = hello.role;
    this.myId = w.id;
    this.code = w.code;
    this.members = w.members;
    this.dispatchEvent(new CustomEvent('joined', { detail: w }));
    this.dispatchEvent(new Event('roster'));
  }

  // NTP-style: keep the offset from the fastest of a few round trips.
  async syncClock(samples = 6) {
    let best = Infinity;
    for (let i = 0; i < samples; i++) {
      const t0 = Date.now();
      const server = await new Promise((resolve) => {
        this.pending = { id: i, resolve };
        this.send({ t: 'ping', id: i });
        setTimeout(() => resolve(null), 1000);
      });
      const t1 = Date.now();
      if (server != null && t1 - t0 < best) {
        best = t1 - t0;
        this.offset = server - (t0 + t1) / 2;
      }
    }
    this.rtt = best;
  }

  receive(ev, onWelcome) {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.t === 'pong') {
      if (this.pending?.id === msg.id) this.pending.resolve(msg.server);
      return;
    }
    if (msg.t === 'welcome') return onWelcome(msg);
    if (msg.t === 'roster') {
      this.members = msg.members;
      this.dispatchEvent(new Event('roster'));
      return;
    }
    this.dispatchEvent(new CustomEvent('message', { detail: msg }));
  }

  send(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  async leave() {
    this.leaving = true;
    const wasHost = this.role === 'host';
    this.ws?.close(1000);
    if (wasHost) await window.desktop?.party.stop();
    this.drop(null);
  }

  drop(reason) {
    if (!this.role && !this.ws) return;
    const role = this.role;
    this.role = null;
    this.ws = null;
    this.members = [];
    this.myId = null;
    if (role) this.dispatchEvent(new CustomEvent('left', { detail: { role, reason: this.leaving ? null : reason } }));
  }
}
