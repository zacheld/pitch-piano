// Part-singing: sing one voice of a Bach chorale while the piano plays the other three.
// Your part scrolls in from the right on the graph; each note turns green or orange as you sing it.
// Extra env used: env.graph (Graph) · env.vtOf(audioTime) app-clock time · env.noteAt(midi, t, dur, gain) · env.click

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
    this.cfg = LEVEL[this.level];
    this.env.view('graph');
    this.env.graph.keyOverride = KEYS.find((x) => x.fifths === this.c.fifths && x.mode === (this.c.mode === 'minor' ? 'minor' : 'major')) || null;
    this.running = false;
    this.partName = PARTS.find((p) => p[0] === this.part)[1].toLowerCase();
    this.ui.question(`${choraleLabel(this.c)} (${choraleKey(this.c)}) — sing the ${this.partName} part.`);
    this.ui.prompt('Headphones help: then the mic hears only you. Start gives one bar of clicks.');
    this.ui.buttons([{ id: 'mine', label: '▶ Hear my part' }, { id: 'go', label: 'Start', primary: true }]);
    this.buildTime();
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
  button(id) {
    if (id === 'mine') { this.stopRun(); this.play(this.env.now() + 0.2, { others: false, mine: 1 }); }
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
    const vt0 = this.env.vtOf(t0);
    this.script = this.c.voices[this.part].map(([q, d, m]) => ({ midi: m, t0: vt0 + this.T(q) * this.spq, t1: vt0 + this.T(q + d) * this.spq, state: 'pending', inT: 0, tot: 0 }));
    this.env.graph.script = this.script;
    this.env.graph.lookahead = 3;
    this.running = true; this.voiced = 0; this.voicedIn = 0;
    this.ui.prompt('');
    this.ui.buttons([{ id: 'stop', label: '■ Stop' }]);
    this.endTimer = setTimeout(() => this.finish(), (t0 - this.env.now() + this.length + 0.8) * 1000);
  }
  live(note, cents, dt, line, centre, t) {
    if (!this.running) return;
    for (const s of this.script) {
      if (s.state === 'good' || s.state === 'off') continue;
      if (t >= s.t1) { s.state = s.tot > 0 && s.inT / s.tot >= 0.5 ? 'good' : 'off'; continue; }
      if (t < s.t0) break;
      s.state = 'current';
      if (t < s.t0 + 0.15) break; // let the note start before judging
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
    for (const s of this.script) if (s.state !== 'good') s.state = s.tot > 0 && s.inT / s.tot >= 0.5 ? 'good' : 'off';
    const good = this.script.filter((s) => s.state === 'good').length;
    const pct = this.voiced > 0 ? Math.round((this.voicedIn / this.voiced) * 100) : 0;
    this.total++; if (good / this.script.length >= 0.8) this.right++;
    this.score();
    this.ui.prompt(`${good} of ${this.script.length} notes right · in tune ${pct}% of the time you sang.`);
    this.ui.buttons([{ id: 'mine', label: '▶ Hear my part' }, { id: 'go', label: 'Again', primary: true }]);
  }
  stopRun() { if (this.running) { this.running = false; clearTimeout(this.endTimer); } this.env.stopScheduled(); this.env.graph.script = []; this.env.graph.lookahead = 0; }
  stop() { super.stop(); this.stopRun(); }
}
export { LETTERS, sleep };
