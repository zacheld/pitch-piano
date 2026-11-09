// Part-singing: sing one voice of a Bach chorale while the piano plays the other three.
// The music scrolls past a play line, as notation (all four parts, or just yours) or as bars on the
// pitch graph; each of your notes turns green or orange as you sing it.
// Extra env used: env.graph (Graph) · env.staff · env.vtOf(audioTime) app-clock time · env.noteAt(midi, t, dur, gain) · env.click

import { Exercise, sleep } from './practice.js';
import { KEYS, LETTERS } from './notation.js';

let DATA = null;
export async function loadChorales() {
  if (!DATA) DATA = await (await fetch('data/chorales.json')).json();
  return DATA;
}
export const PARTS = [['S', 'Soprano'], ['A', 'Alto'], ['T', 'Tenor'], ['B', 'Bass']];
export function choraleKey(c) {
  const k = KEYS.find((x) => x.fifths === c.fifths && x.mode === (c.mode === 'minor' ? 'minor' : 'major'));
  return k ? k.name : `${c.fifths} ${c.fifths >= 0 ? 'sharps' : 'flats'}`;
}
export const choraleLabel = (c) => `BWV ${c.bwv}`;
export const choraleBlurb = (c) => `${choraleKey(c)} · ${c.time.join('/')} · ${Math.round(c.length / c.time[0])} bars`;

const LEVEL = { easy: { tempo: 54, guide: 0.45 }, medium: { tempo: 66, guide: 0 }, hard: { tempo: 80, guide: 0 } };

export class PartSinging extends Exercise {
  start() {
    this.c = this.opts.chorale; this.part = this.opts.part || 'T';
    this.mode = this.opts.view || 'all';
    this.cfg = LEVEL[this.level];
    this.env.graph.keyOverride = KEYS.find((x) => x.fifths === this.c.fifths && x.mode === (this.c.mode === 'minor' ? 'minor' : 'major')) || null;
    this.running = false;
    this.partName = PARTS.find((p) => p[0] === this.part)[1].toLowerCase();
    this.buildTime();
    if (this.mode === 'graph') this.env.view('graph');
    else {
      this.env.view('staff');
      const self = this;
      this.sv = {
        score: true, chorale: this.c, part: this.part, mode: this.mode, T: this.T, trail: [], pan: null, animate: false,
        now: () => (self.t0 == null ? null : (self.env.now() - self.t0) / self.spq),
        states: () => self.script || null,
        drag(dx) { if (self.t0 != null) return; this.pan = Math.max(this._panMin, Math.min(this._panMax, this.pan - dx)); },
      };
      this.env.staff.setExercise(this.sv);
    }
    this.t0 = null;
    this.ui.question(`${choraleLabel(this.c)} (${choraleKey(this.c)}): sing the ${this.partName} part.`);
    this.ui.prompt(this.mode === 'graph' ? 'Headphones help: then the mic hears only you. Start gives one bar of clicks.'
      : 'Drag the music sideways to read ahead. Start gives one bar of clicks. Headphones help: then the mic hears only you.');
    this.idleButtons('Start');
  }
  idleButtons(go) {
    this.ui.buttons([{ id: 'mine', label: '▶ My part' }, { id: 'all', label: '▶ All' }, { id: 'go', label: go, primary: true }]);
  }
  /** Scroll the score along with something playing from audio time t0 (null = stop). */
  follow(t0, seconds) {
    clearTimeout(this.followTimer);
    this.t0 = t0;
    if (!this.sv) return;
    this.sv.animate = t0 != null; this.env.staff.dirty = true;
    if (t0 != null && seconds) this.followTimer = setTimeout(() => this.park(), (t0 - this.env.now() + seconds + 0.3) * 1000);
  }
  /** Stop scrolling and leave the music where it is, so you can look back over it. */
  park() {
    if (this.sv && this.t0 != null && this.sv._shiftOf) {
      const w = (this.env.now() - this.t0) / this.spq;
      this.sv.pan = Math.max(this.sv._panMin, Math.min(this.sv._panMax, this.sv._shiftOf(w)));
    }
    this.follow(null);
  }
  /** Fermatas (phrase-end pauses) are held a little longer than written. */
  buildTime() {
    const f = this.c.voices.S.filter((n) => n[3]).map((n) => ({ start: n[0], end: n[0] + n[1], extra: n[1] * 0.8 }));
    this.T = (q) => {
      let add = 0;
      for (const x of f) { if (q >= x.end) add += x.extra; else if (q > x.start) add += ((q - x.start) / (x.end - x.start)) * x.extra; }
      return q + add;
    };
    this.spq = 60 / this.cfg.tempo;
  }
  /** Plays the chosen parts from audio time t0. */
  play(t0, { others = true, mine = 0 } = {}) {
    for (const [p] of PARTS) {
      const gain = p === this.part ? mine : others ? (p === 'B' ? 0.9 : 0.75) : 0;
      if (!gain) continue;
      for (const [q, d, m] of this.c.voices[p]) {
        const a = t0 + this.T(q) * this.spq, b = t0 + this.T(q + d) * this.spq;
        this.env.noteAt(m, a, Math.max(0.1, b - a - 0.04), gain);
      }
    }
  }
  get length() { return this.T(this.c.length) * this.spq; }
  /** Your part's notes, timed from audio time t0 (in the app's clock), for scoring and the graph. */
  makeScript(t0) {
    const vt0 = this.env.vtOf(t0);
    // t0/t1: app clock (for drawing on the graph); a0/a1: audio clock (for judging, so it can't drift)
    return this.c.voices[this.part].map(([q, d, m]) => ({ midi: m, t0: vt0 + this.T(q) * this.spq, t1: vt0 + this.T(q + d) * this.spq,
      a0: t0 + this.T(q) * this.spq, a1: t0 + this.T(q + d) * this.spq, state: 'pending', inT: 0, tot: 0 }));
  }
  button(id) {
    if (id === 'mine' || id === 'all') {
      this.stopRun();
      const t0 = this.env.now() + 0.2;
      this.play(t0, { others: id === 'all', mine: 1 });
      if (this.sv) { this.sv.trail = []; this.script = null; }
      else { this.env.graph.script = this.makeScript(t0); this.env.graph.lookahead = 3; } // the bars scroll by as you listen
      this.follow(t0, this.length);
      this.ui.buttons([{ id: 'halt', label: '■ Stop' }]);
      clearTimeout(this.listenTimer);
      this.listenTimer = setTimeout(() => this.idleButtons(this.total ? 'Again' : 'Start'), (this.length + 0.4) * 1000);
    }
    if (id === 'halt') { clearTimeout(this.listenTimer); this.env.stopScheduled(); this.park(); this.idleButtons(this.total ? 'Again' : 'Start'); }
    if ((id === 'halt' || id === 'go') && !this.sv && !this.running) { this.env.graph.script = []; this.env.graph.lookahead = 0; }
    if (id === 'go') this.go();
    if (id === 'stop') { this.finish(); this.env.stopScheduled(); }
  }
  go() {
    this.stopRun();
    const bar = this.c.time[0] * this.spq;
    const start = this.env.now() + 0.3;
    for (let i = 0; i < this.c.time[0]; i++) this.env.click(start + i * this.spq, i === 0);
    const t0 = start + bar;
    this.play(t0, { others: true, mine: this.cfg.guide });
    this.script = this.makeScript(t0);
    if (this.mode === 'graph') { this.env.graph.script = this.script; this.env.graph.lookahead = 3; }
    else { this.sv.trail = []; this.follow(t0); }
    this.running = true; this.voiced = 0; this.voicedIn = 0;
    this.ui.prompt('');
    this.ui.buttons([{ id: 'stop', label: '■ Stop' }]);
    this.endTimer = setTimeout(() => this.finish(), (t0 - this.env.now() + this.length + 0.8) * 1000);
  }
  live(note, cents, dt, line, centre, t) {
    if (!this.running) return;
    if (this.sv) { // your pitch, for the trace on the score (the last few beats)
      const tr = this.sv.trail, w = (this.env.now() - this.t0) / this.spq;
      tr.push({ w, m: line });
      while (tr.length && w - tr[0].w > 6) tr.shift();
    }
    const ta = this.env.now();
    for (const s of this.script) {
      if (s.state === 'good' || s.state === 'off') continue;
      if (ta >= s.a1) { s.state = s.tot > 0 && s.inT / s.tot >= 0.5 ? 'good' : 'off'; continue; }
      if (ta < s.a0) break;
      s.state = 'current';
      if (ta < s.a0 + 0.15) break; // let the note start before judging
      s.tot += dt;
      if (centre != null) {
        this.voiced += dt;
        if (Math.abs(centre - s.midi) <= 0.5) { s.inT += dt; this.voicedIn += dt; }
      }
      break;
    }
  }
  finish() {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this.endTimer);
    const ta = this.env.now();
    // judge the notes you reached; ones you never got to (stopped early) stay unmarked
    for (const s of this.script) if (s.state !== 'good' && ta >= s.a0 + 0.15) s.state = s.tot > 0 && s.inT / s.tot >= 0.5 ? 'good' : 'off';
    for (const s of this.script) if (s.state === 'current') s.state = 'pending';
    const reached = this.script.filter((s) => s.state !== 'pending').length;
    const good = this.script.filter((s) => s.state === 'good').length;
    const pct = this.voiced > 0 ? Math.round((this.voicedIn / this.voiced) * 100) : 0;
    this.total++; if (reached && good / reached >= 0.8 && reached === this.script.length) this.right++;
    this.score();
    this.park();
    const early = reached < this.script.length ? ` (stopped after ${reached} of ${this.script.length})` : '';
    this.ui.prompt(`${good} of ${reached} notes right${early} · in tune ${pct}% of the time you sang.${this.sv ? ' Drag the music to look back.' : ''}`);
    this.idleButtons('Again');
  }
  stopRun() {
    if (this.running) { this.running = false; clearTimeout(this.endTimer); }
    clearTimeout(this.listenTimer);
    this.env.stopScheduled(); this.env.graph.script = []; this.env.graph.lookahead = 0;
    this.follow(null);
  }
  stop() { super.stop(); this.stopRun(); }
}
export { LETTERS, sleep };
