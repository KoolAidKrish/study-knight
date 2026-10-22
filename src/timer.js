// Study plans and the timer that walks through them.
// All timing is timestamp-based, so it stays correct when the window is hidden.

const f = (min) => ({ type: 'focus', min });
const b = (min) => ({ type: 'break', min });

export const PRESETS = [
  {
    id: 'descending',
    name: 'Descending',
    pattern: '50 · 10 · 40 · 10 · 30 · 10',
    blurb: 'Start with your longest block while you are fresh and shorten each one as focus fades. 2 hours of focus.',
    round: [f(50), b(10), f(40), b(10), f(30), b(10)],
    rounds: 1,
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    pattern: '4 × (25 · 5), long 15',
    blurb: 'The classic. Short sprints with short rests, then a longer break after the fourth sprint.',
    round: [f(25), b(5), f(25), b(5), f(25), b(5), f(25), b(15)],
    rounds: 1,
  },
  {
    id: '52-17',
    name: '52 / 17',
    pattern: '52 · 17',
    blurb: 'From DeskTime’s data on its most productive users: about 52 minutes of focus, then a real 17 minute break.',
    round: [f(52), b(17)],
    rounds: 3,
  },
  {
    id: 'ultradian',
    name: 'Ultradian 90 / 20',
    pattern: '90 · 20',
    blurb: 'Follows the ~90 minute ultradian rhythm. Best for deep work: problem sets, writing, coding.',
    round: [f(90), b(20)],
    rounds: 2,
  },
  {
    id: 'flowtime',
    name: 'Flowtime',
    pattern: 'focus ↑ · break ∝ focus',
    blurb: 'No fixed blocks. Focus until you naturally drift, then take a break sized to how long you went.',
    flow: true,
    rounds: 1,
  },
  {
    id: 'custom',
    name: 'Custom',
    pattern: 'build your own',
    blurb: 'Lay out your own sequence of focus and break blocks.',
    custom: true,
    rounds: 1,
  },
];

// Flowtime break lengths: the usual recommendation, scaled to the focus you just did.
export function flowBreakMinutes(focusMs) {
  const m = focusMs / 60000;
  if (m < 25) return 5;
  if (m < 50) return 8;
  if (m < 90) return 10;
  return 15;
}

const FLOW_NOMINAL_MS = 120 * 60000; // sky reaches night after 2h of flowtime focus
const STORE = 'studyknight.session.v1';

export class Timer extends EventTarget {
  constructor() {
    super();
    this.lastSave = 0;
    this.remote = false;   // true while a party host drives this timer; we only display it
    this.booting = true;   // don't overwrite a saved session before restore() reads it
    this.reset({ presetId: 'descending', rounds: 1, custom: [f(45), b(10)] });
  }

  // ----- plan -----

  reset(opts = {}) {
    this.presetId = opts.presetId ?? this.presetId;
    this.rounds = opts.rounds ?? this.rounds;
    this.custom = opts.custom ?? this.custom;
    this.segments = this.buildSegments();
    this.index = 0;
    this.status = 'ready';        // ready | running | paused | waiting | done
    this.startedAt = 0;           // when the current run of the segment started
    this.banked = 0;              // ms of the current segment already elapsed before a pause
    this.focusDone = 0;           // ms of completed focus in this plan
    this.emit();
  }

  get preset() {
    return PRESETS.find((p) => p.id === this.presetId) ?? PRESETS[0];
  }

  get isFlow() {
    return !!this.preset.flow;
  }

  buildSegments() {
    const p = this.preset;
    if (p.flow) return [{ type: 'focus', min: null }];
    const round = p.custom ? this.custom.filter((s) => s.min > 0) : p.round;
    const out = [];
    for (let r = 0; r < Math.max(1, this.rounds); r++) out.push(...round.map((s) => ({ ...s })));
    return out.length ? out : [f(25)];
  }

  // ----- clock -----

  get current() {
    return this.segments[this.index];
  }

  elapsed(now = Date.now()) {
    return this.banked + (this.status === 'running' ? now - this.startedAt : 0);
  }

  remaining(now = Date.now()) {
    const seg = this.current;
    if (!seg || seg.min == null) return null;
    return Math.max(0, seg.min * 60000 - this.elapsed(now));
  }

  totalFocusMs() {
    if (this.isFlow) return FLOW_NOMINAL_MS;
    return this.segments.filter((s) => s.type === 'focus').reduce((a, s) => a + s.min * 60000, 0);
  }

  // 0 at the start of the plan, 1 when all focus is done. Drives the sky.
  progress(now = Date.now()) {
    const cur = this.current?.type === 'focus' && this.status !== 'done' ? this.elapsed(now) : 0;
    return Math.min(1, (this.focusDone + cur) / this.totalFocusMs());
  }

  // ----- controls -----

  start() {
    if (this.status === 'done') this.reset();
    if (this.status === 'running') return;
    this.startedAt = Date.now();
    this.status = 'running';
    this.emit();
  }

  pause() {
    if (this.status !== 'running') return;
    this.banked = this.elapsed();
    this.status = 'paused';
    this.emit();
  }

  toggle() {
    this.status === 'running' ? this.pause() : this.start();
  }

  // Ends the current block early (or, in flowtime focus, starts the earned break).
  skip(autoStart) {
    if (this.status === 'done') return;
    this.finishSegment(Date.now(), autoStart, true);
  }

  tick(autoStart) {
    if (this.status !== 'running' || this.remote) return;
    if (Date.now() - this.lastSave > 5000) this.save();
    const rem = this.remaining();
    if (rem !== null && rem <= 0) this.finishSegment(Date.now(), autoStart, false);
  }

  finishSegment(now, autoStart, skipped) {
    const seg = this.current;
    const spent = seg.min == null ? this.elapsed(now) : Math.min(this.elapsed(now), seg.min * 60000);
    if (seg.type === 'focus') {
      this.focusDone += spent;
      this.dispatchEvent(new CustomEvent('focuslogged', { detail: { ms: spent } }));
    }

    if (this.isFlow) {
      // focus → earned break → fresh open-ended focus, forever
      if (seg.type === 'focus') this.segments.push(b(flowBreakMinutes(spent)));
      else this.segments.push({ type: 'focus', min: null });
    }

    const prev = seg;
    this.index++;
    this.banked = 0;
    if (this.index >= this.segments.length) {
      this.index = this.segments.length - 1;
      this.status = 'done';
      this.banked = this.current.min * 60000;
    } else if (autoStart) {
      this.startedAt = now;
      this.status = 'running';
    } else {
      this.status = 'waiting';
    }
    this.dispatchEvent(new CustomEvent('segmentend', { detail: { prev, next: this.status === 'done' ? null : this.current, skipped } }));
    this.emit();
  }

  emit() {
    this.save();
    this.dispatchEvent(new Event('change'));
  }

  // ----- persistence: a session survives closing the app -----

  save() {
    if (this.booting || this.remote) return;
    try {
      const { presetId, rounds, custom, segments, index, status, startedAt, banked, focusDone } = this;
      this.lastSave = Date.now();
      localStorage.setItem(STORE, JSON.stringify({ presetId, rounds, custom, segments, index, status, startedAt, banked, focusDone, savedAt: this.lastSave }));
    } catch {}
  }

  // ----- party sync: the host sends its plan with timestamps on the relay's clock -----

  snapshot(toServer = (t) => t) {
    const { presetId, rounds, custom, segments, index, status, banked, focusDone } = this;
    return { presetId, rounds, custom, segments, index, status, banked, focusDone, startedAt: toServer(this.startedAt) };
  }

  applySnapshot(snap, toLocal = (t) => t) {
    if (!snap) return;
    Object.assign(this, {
      presetId: snap.presetId, rounds: snap.rounds, custom: snap.custom, segments: snap.segments,
      index: snap.index, status: snap.status, banked: snap.banked, focusDone: snap.focusDone,
      startedAt: toLocal(snap.startedAt),
    });
    this.emit();
  }

  restore() {
    this.booting = false;
    try {
      const s = JSON.parse(localStorage.getItem(STORE));
      if (!s) return;
      Object.assign(this, {
        presetId: s.presetId, rounds: s.rounds, custom: s.custom?.length ? s.custom : this.custom,
      });
      const stale = Date.now() - s.savedAt > 12 * 3600e3;
      if (stale || !s.segments?.length) {
        this.reset();
        return;
      }
      Object.assign(this, {
        segments: s.segments, index: s.index, status: s.status,
        startedAt: s.startedAt, banked: s.banked, focusDone: s.focusDone,
      });
      // A session that was running when the app closed comes back paused where it left off.
      if (this.status === 'running') {
        const seg = this.current;
        const el = this.banked + (s.savedAt - this.startedAt);
        this.banked = seg.min == null ? el : Math.min(el, seg.min * 60000 - 1000);
        this.status = 'paused';
      }
      this.emit();
    } catch {
      this.reset();
    }
  }
}
