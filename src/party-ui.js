// Party tab + the glue between a party session and the timer.
// Host: streams timer snapshots and timer events to the party. Member: shows the host's timer read-only.

import { Party } from './party.js';
import { icon } from './pixels.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function initParty({ timer, prefs, savePrefs, onPlanChange, openPartyTab }) {
  const party = new Party();
  let busy = false;

  const nameInput = $('partyName');
  const addrInput = $('joinAddr');
  const codeInput = $('joinCode');
  nameInput.value = prefs.name ?? '';
  addrInput.value = prefs.lastHost ?? '';
  const myName = () => nameInput.value.trim() || 'Knight';
  nameInput.addEventListener('input', () => { prefs.name = nameInput.value.trim(); savePrefs(); });
  codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, ''); });

  const showError = (msg) => { $('partyError').textContent = msg || ''; };

  async function attempt(fn) {
    if (busy) return;
    busy = true;
    showError('');
    render();
    try { await fn(); } catch (e) { showError(e.message); }
    busy = false;
    render();
  }

  $('hostBtn').addEventListener('click', () => attempt(() => party.host(myName())));
  $('joinBtn').addEventListener('click', () => attempt(async () => {
    if (codeInput.value.length !== 4) throw new Error('Party codes are 4 letters.');
    await party.join(addrInput.value, codeInput.value, myName());
    prefs.lastHost = addrInput.value.trim();
    savePrefs();
  }));
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });
  $('leaveBtn').addEventListener('click', () => attempt(() => party.leave()));
  $('partyPill').addEventListener('click', openPartyTab);

  // ---------- host: broadcast ----------

  const sendState = () => party.send({ t: 'state', snapshot: timer.snapshot((t) => party.toServer(t)) });
  timer.addEventListener('change', () => { if (party.role === 'host') sendState(); });
  for (const kind of ['segmentend', 'focuslogged']) {
    timer.addEventListener(kind, (e) => {
      if (party.role === 'host') party.send({ t: 'event', kind, detail: e.detail });
    });
  }

  // ---------- session events ----------

  party.addEventListener('joined', (e) => {
    if (party.role === 'host') {
      sendState();
    } else {
      timer.remote = true;
      timer.applySnapshot(e.detail.snapshot, (t) => party.toLocal(t));
      onPlanChange();
    }
    render();
  });

  party.addEventListener('message', (e) => {
    const msg = e.detail;
    if (party.role !== 'member') return;   // members' requests (votes) arrive in a later update
    if (msg.t === 'state') {
      timer.applySnapshot(msg.snapshot, (t) => party.toLocal(t));
      onPlanChange();
    } else if (msg.t === 'event' && (msg.kind === 'segmentend' || msg.kind === 'focuslogged')) {
      // Replay the host's timer events here: notifications and your own focus stats.
      timer.dispatchEvent(new CustomEvent(msg.kind, { detail: msg.detail }));
    }
  });

  party.addEventListener('left', (e) => {
    const { role, reason } = e.detail;
    if (role === 'member') {
      timer.remote = false;
      if (reason) timer.emit();       // host gone: keep going solo from where the party was
      else timer.restore();           // you left: back to your own session
      onPlanChange();
    }
    showError(reason ?? '');
    render();
  });

  party.addEventListener('roster', render);

  // ---------- view ----------

  function render() {
    const live = party.active;
    const host = party.role === 'host';
    document.body.classList.toggle('party-member', party.role === 'member');
    $('partySolo').hidden = live;
    $('partyLive').hidden = !live;
    $('hostBtn').disabled = busy;
    $('joinBtn').disabled = busy;
    $('leaveBtn').disabled = busy;
    if (!window.desktop?.party) {
      $('hostBtn').disabled = true;
      $('hostBtn').title = 'Hosting needs the desktop app';
    }

    const pill = $('partyPill');
    pill.hidden = !live;
    if (live) {
      pill.innerHTML = `${icon('party')}<span>${esc(party.code)}</span><b>${party.members.length}</b>`;
      pill.title = `Party ${party.code} · ${party.members.length} adventurer${party.members.length === 1 ? '' : 's'}`;
      $('partyCode').textContent = party.code;
      const port = party.port !== 47820 ? ':' + party.port : '';
      const [main, ...more] = party.addresses;
      $('partyAddr').innerHTML = !host
        ? 'You’re following the host’s timer.'
        : !main
          ? 'No network found. Connect to Wi-Fi so others can join.'
          : `Friends join at <code>${esc(main.address)}${port}</code>` +
            (more.length ? `<small class="also">also ${more.map((a) => `<code>${esc(a.address)}${port}</code>${a.label ? ` (${a.label})` : ''}`).join(', ')}</small>` : '');
      $('partyCount').textContent = `${party.members.length} / 13`;
      $('partyMembers').innerHTML = party.members.map((m) => `
        <li class="${m.host ? 'is-host' : ''}">
          ${icon(m.host ? 'crown' : 'sword')}
          <span>${esc(m.name)}</span>
          <small>${m.id === party.myId ? 'you' : m.host ? 'host' : ''}</small>
        </li>`).join('');
      $('partyRole').textContent = host
        ? 'You run the timer for everyone. Members will be able to vote on pauses and skips in a later update.'
        : 'Only the host can start, pause or skip for now.';
      $('leaveLabel').textContent = host ? 'End party' : 'Leave party';
    }
  }

  render();
  return party;
}
