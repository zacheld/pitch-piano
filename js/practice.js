// Practice exercises. Each one talks to the app only through `env` (see app.js):
//   env.key() practice key · env.randomKey() · env.range() comfortable range · env.full() whole voice
//   env.tol() cents allowed · env.rng() · env.play(seq) → Promise (mic ignored while it plays)
//   env.staff (StaffView) · env.view('staff'|'graph') · env.ui.{title,score,prompt,buttons,answers}
//   env.name(midi, key) · env.sol(midi, key) · env.load(id, def) / env.save(id, data)
// The app feeds frame(t, note, cents, line, centre) about 60×/s while listening (note = null in silence
// or while a prompt plays), key(midi) for piano taps, button(id) and answer(value) for the on-screen controls.

import { generateMelody, chooseTonic, degreeMidi, LEVELS } from './melody.js';
import { KEYS, INTERVALS, spell, intervalFrom, intervalName, scaleOf, noteName, degreeOf } from './notation.js';
import { Transcriber, analyzeHeldNote } from './analysis.js';

const cls = (cents, tol) => (Math.abs(cents) <= Math.min(10, tol) ? 'good' : Math.abs(cents) <= tol ? 'near' : 'off');
const signed = (c) => (c > 0 ? '+' : c < 0 ? '−' : '±') + Math.abs(c) + '¢';
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SOL_ALL = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'];

export class Exercise {
  constructor(env, opts) {
    this.env = env; this.opts = opts; this.ui = env.ui; this.tol = env.tol();
    this.catcher = new Transcriber({ minHold: 0.45, skip: 0.15 }); // judge the settled pitch, not the scoop into it
    this.lastT = 0; this.stopped = false;
    this.right = 0; this.total = 0;
  }
  get needsMic() { return true; }
  frame(t, note, cents, line, centre) {
    const dt = this.lastT ? Math.min(0.1, t - this.lastT) : 0;
    this.lastT = t;
    this.live(note, cents, dt, line, centre, t);
    const ev = this.catcher.feed(t, note, cents);
    if (ev && ev.type === 'write') this.held(ev.note, ev.cents, t);
  }
  live() {}
  held() {}
  key() {}
  button() {}
  answer() {}
  stop() { this.stopped = true; }
  score() { this.ui.score(this.total ? `${this.right}/${this.total}` : ''); }
  /** Tonic arpeggio, then a held tonic: do–mi–sol–do'–do, to set the key in your ear. */
  keyIntro(key, tonic) {
    const s = scaleOf(key);
    return this.env.play([
      { notes: [tonic], dur: 0.32 }, { notes: [tonic + s[2]], dur: 0.32 }, { notes: [tonic + s[4]], dur: 0.32 },
      { notes: [tonic + 12], dur: 0.32 }, { notes: [tonic], dur: 1.0 },
    ]);
  }
}

// ---------- Read and sing ----------

class SightSinging extends Exercise {
  start() { this.next(); }
  next() {
    const key = this.opts.keyMode === 'random' ? this.env.randomKey() : this.env.key();
    const { low, high } = this.env.range();
    const m = generateMelody({ key, level: this.opts.level, length: this.opts.length, low, high, rng: this.env.rng });
    if (!m) return this.ui.prompt('Your practice range is too narrow for this key. Widen it in Settings → Practice.');
    Object.assign(this, { key, tonic: m.tonic, i: 0, done: false, misses: 0 });
    this.notes = m.notes.map((n) => ({ midi: n.midi, state: 'pending', first: true, sung: [] }));
    this.notes[0].state = 'current';
    this.show();
    this.ui.buttons([{ id: 'do', label: 'Hear do' }, { id: 'melody', label: 'Hear melody' }, { id: 'skip', label: 'Skip note' }, { id: 'new', label: 'New melody' }]);
    this.ui.prompt(`${key.name} · listen for <b>do</b>, then sing the melody.`);
    this.keyIntro(key, m.tonic).then(() => { if (!this.done && !this.stopped) this.ui.prompt('Sing the highlighted note.'); });
  }
  show() {
    this.env.staff.setExercise({ key: this.key, items: this.notes.map((n) => ({
      midi: n.midi, state: n.state, sung: n.sung,
      label: this.done ? this.env.sol(n.midi, this.key) : null,
    })) });
  }
  live(note, cents) {
    if (this.done) return;
    const cur = this.notes[this.i];
    cur.sung = note == null || note === cur.midi ? [] : [{ midi: note, cls: 'off' }];
    this.show();
  }
  held(note, cents) {
    if (this.done) return;
    const cur = this.notes[this.i];
    if (note === cur.midi && Math.abs(cents) <= this.tol) {
      cur.state = cls(cents, this.tol); cur.sung = [];
      this.total++; if (cur.first) this.right++;
      this.advance();
    } else if (note === cur.midi) {
      this.ui.prompt(`Right note — ${signed(cents)}. ${cents > 0 ? 'A little lower' : 'A little higher'}.`);
    } else {
      cur.first = false;
      this.ui.prompt(`That was ${this.env.name(note, this.key)}. ${note < cur.midi ? 'Higher' : 'Lower'}.`);
    }
    this.score();
  }
  advance() {
    this.i++;
    if (this.i >= this.notes.length) return this.finish();
    this.notes[this.i].state = 'current';
    this.ui.prompt('Sing the highlighted note.');
    this.show();
  }
  finish() {
    this.done = true; this.show();
    const first = this.notes.filter((n) => n.first).length;
    this.ui.prompt(`Done! ${first} of ${this.notes.length} right first time. Names are under the notes.`);
    this.ui.buttons([{ id: 'melody', label: 'Hear it' }, { id: 'new', label: 'Next melody', primary: true }]);
  }
  button(id) {
    if (id === 'do') this.keyIntro(this.key, this.tonic);
    if (id === 'melody') this.env.play(this.notes.map((n) => ({ notes: [n.midi], dur: 0.55, gap: 0.05 })));
    if (id === 'skip' && !this.done) { this.notes[this.i].state = 'off'; this.notes[this.i].first = false; this.notes[this.i].sung = []; this.total++; this.score(); this.advance(); }
    if (id === 'new') this.next();
  }
}

class Intervals extends Exercise {
  start() { this.next(); }
  next() {
    const set = this.opts.set === 'all' ? INTERVALS : INTERVALS.filter((i) => ['M2', 'M3', 'P4', 'P5', 'P8'].includes(i.id));
    const iv = pick(this.env.rng, set);
    const dir = this.opts.dir === 'up' ? 1 : this.opts.dir === 'down' ? -1 : pick(this.env.rng, [1, -1]);
    const { low, high } = this.env.range();
    const starts = [];
    for (let m = low; m <= high; m++) if (m + dir * iv.semis >= low && m + dir * iv.semis <= high) starts.push(m);
    if (!starts.length) return this.ui.prompt('Your practice range is too narrow. Widen it in Settings → Practice.');
    const key = this.env.key();
    const s = spell(pick(this.env.rng, starts), key);
    const target = intervalFrom(s, iv, dir);
    Object.assign(this, { key, iv, dir, start: s.midi, target: target.midi, done: false, first: true, tries: [] });
    this.items = [{ midi: s.midi, state: 'given', label: this.env.name(s.midi, key) }, { midi: target.midi, state: 'hidden', sung: [] }];
    this.show();
    const what = `a <b>${iv.name}</b> ${dir > 0 ? 'up' : 'down'} from ${this.env.name(s.midi, key)}`;
    this.ui.prompt(`Sing ${what}.`);
    this.ui.buttons([{ id: 'start', label: 'Hear start note' }, { id: 'answer', label: 'Show answer' }, { id: 'next', label: 'Next' }]);
    this.env.play([{ notes: [s.midi], dur: 1.0 }]);
  }
  show() { this.env.staff.setExercise({ key: this.key, items: this.items }); }
  held(note, cents) {
    if (this.done || note === this.start) return; // singing the start note first is fine
    if (note === this.target && Math.abs(cents) <= this.tol) {
      this.reveal(cls(cents, this.tol));
      this.total++; if (this.first) this.right++;
      this.ui.prompt(`✓ ${this.env.name(this.start, this.key)} → ${this.env.name(this.target, this.key)}: ${this.iv.name} ${this.dir > 0 ? 'up' : 'down'} (${signed(cents)}).`);
    } else {
      this.first = false;
      const semis = note - this.start;
      this.items[1].sung = [{ midi: note, cls: 'off' }];
      this.show();
      this.ui.prompt(`That was ${this.env.name(note, this.key)} — a ${intervalName(semis)} ${semis > 0 ? 'up' : 'down'}. Try again.`);
    }
    this.score();
  }
  reveal(state) {
    this.done = true;
    this.items[1] = { midi: this.target, state, label: this.env.name(this.target, this.key), sung: [] };
    this.show();
    this.ui.buttons([{ id: 'both', label: 'Hear both' }, { id: 'next', label: 'Next', primary: true }]);
    this.env.play([{ notes: [this.start], dur: 0.6 }, { notes: [this.target], dur: 0.9 }]);
  }
  button(id) {
    if (id === 'start') this.env.play([{ notes: [this.start], dur: 1.0 }]);
    if (id === 'both') this.env.play([{ notes: [this.start], dur: 0.6 }, { notes: [this.target], dur: 0.9 }]);
    if (id === 'answer' && !this.done) { this.total++; this.score(); this.reveal('given'); this.ui.prompt(`The answer: ${this.env.name(this.target, this.key)}.`); }
    if (id === 'next') this.next();
  }
}

// ---------- Listen and sing ----------

class Echo extends Exercise {
  start() { this.next(); }
  next() {
    const key = this.env.key();
    const { low, high } = this.env.range();
    const m = generateMelody({ key, level: this.opts.level, length: this.opts.length, low, high, rng: this.env.rng });
    if (!m) return this.ui.prompt('Your practice range is too narrow for this key. Widen it in Settings → Practice.');
    Object.assign(this, { key, tonic: m.tonic, i: 0, done: false, clean: true });
    this.notes = m.notes.map((n) => ({ midi: n.midi, state: 'hidden', sung: [] }));
    this.show();
    this.ui.buttons([{ id: 'again', label: 'Hear again' }, { id: 'answer', label: 'Show answer' }, { id: 'new', label: 'New tune' }]);
    this.ui.prompt('Listen…');
    this.playAll().then(() => { if (!this.done && !this.stopped) this.ui.prompt(`Sing it back: ${this.notes.length} notes.`); });
  }
  playAll() {
    return this.env.play([{ notes: [this.tonic], dur: 0.7, gap: 0.35 }, ...this.notes.map((n) => ({ notes: [n.midi], dur: 0.6, gap: 0.06 }))]);
  }
  show() {
    this.env.staff.setExercise({ key: this.key, items: this.notes.map((n) => ({
      midi: n.state === 'hidden' ? null : n.midi, state: n.state, sung: n.sung,
      label: n.state !== 'hidden' ? this.env.sol(n.midi, this.key) : null,
    })) });
  }
  held(note, cents) {
    if (this.done) return;
    const cur = this.notes[this.i];
    if (note === cur.midi && Math.abs(cents) <= this.tol) {
      cur.state = cls(cents, this.tol); cur.sung = [];
      this.i++;
      if (this.i >= this.notes.length) return this.finish(true);
      this.ui.prompt(`${this.i} of ${this.notes.length} — keep going.`);
    } else if (note !== cur.midi) {
      this.clean = false;
      cur.sung = [{ midi: note, cls: 'off' }];
      this.ui.prompt(`Not quite — note ${this.i + 1} is ${note < cur.midi ? 'higher' : 'lower'} than ${this.env.name(note, this.key)}.`);
    }
    this.show();
  }
  finish(byEar) {
    this.done = true;
    this.total++; if (byEar && this.clean) this.right++;
    this.score();
    for (const n of this.notes) { if (n.state === 'hidden') n.state = 'given'; n.sung = []; }
    this.show();
    this.ui.prompt(byEar ? (this.clean ? '✓ Perfect — every note right first time.' : '✓ Got it.') : 'Here it is — sing it along.');
    this.ui.buttons([{ id: 'again', label: 'Hear again' }, { id: 'new', label: 'New tune', primary: true }]);
  }
  button(id) {
    if (id === 'again') this.playAll();
    if (id === 'answer' && !this.done) this.finish(false);
    if (id === 'new') this.next();
  }
}

class PitchMatch extends Exercise {
  start() { this.next(); }
  next() {
    const { low, high } = this.env.range();
    const target = low + Math.floor(this.env.rng() * (high - low + 1));
    Object.assign(this, { target, on: 0, done: false, first: true, ready: false, key: this.env.key() });
    this.items = [{ midi: target, state: 'hidden', sung: [] }];
    this.show();
    this.ui.buttons([{ id: 'again', label: 'Hear again' }, { id: 'next', label: 'Next' }]);
    const memory = this.opts.mode === 'memory';
    this.ui.prompt('Listen…');
    this.env.play([{ notes: [target], dur: 1.3 }]).then(async (ok) => {
      if (!ok || this.stopped) return;
      if (memory) {
        for (let s = 4; s > 0; s--) {
          if (this.stopped || this.target !== target) return;
          this.ui.prompt(`Keep it in your head… ${s}`);
          await sleep(1000);
        }
      }
      if (this.target === target && !this.done) { this.ready = true; this.ui.prompt('Sing it and hold it.'); }
    });
  }
  show() { this.env.staff.setExercise({ key: this.key, items: this.items }); }
  live(note, cents, dt) {
    if (this.done || !this.ready || note == null) { this.on = 0; return; }
    if (note === this.target && Math.abs(cents) <= this.tol) {
      this.on += dt;
      this.ui.prompt(`On it (${signed(cents)}) — hold…`);
      if (this.on >= 1.0) this.success(cents);
    } else {
      this.on = 0;
      const d = this.target * 100 - (note * 100 + cents);
      const semis = Math.round(Math.abs(d) / 100);
      this.ui.prompt(Math.abs(d) < 100 ? `${d > 0 ? 'A little higher' : 'A little lower'} (${signed(-Math.round(d))})`
        : `${d > 0 ? 'Higher' : 'Lower'} — about ${semis} semitone${semis === 1 ? '' : 's'}`);
      this.items[0].sung = [{ midi: note, cls: 'off' }];
      this.show();
    }
  }
  held(note) { if (this.ready && !this.done && note !== this.target) this.first = false; }
  success(cents) {
    this.done = true;
    this.total++; if (this.first) this.right++;
    this.score();
    this.items[0] = { midi: this.target, state: cls(cents, this.tol), label: this.env.name(this.target, this.key), sung: [] };
    this.show();
    this.ui.prompt(`✓ ${this.env.name(this.target, this.key)}, ${signed(cents)}.`);
    this.ui.buttons([{ id: 'again', label: 'Hear it' }, { id: 'next', label: 'Next', primary: true }]);
  }
  button(id) {
    if (id === 'again') { if (!this.done) this.first = false; this.env.play([{ notes: [this.target], dur: 1.2 }]); }
    if (id === 'next') this.next();
  }
}

class ScaleReturn extends Exercise {
  start() { this.next(); }
  next() {
    const key = this.env.key();
    const { low, high } = this.env.full();
    const place = chooseTonic(key, low, high - 12 >= low ? high - 12 : high);
    if (!place || place.t + 12 > high) return this.ui.prompt('Your voice range needs at least an octave for this. Check Settings → Practice.');
    const scale = scaleOf(key), t = place.t;
    const up = [0, 1, 2, 3, 4, 5, 6, 7].map((d) => degreeMidi(t, scale, d));
    Object.assign(this, { key, tonic: t, i: 0, done: false, results: [] });
    this.seq = [...up, ...up.slice(0, 7).reverse()]; // do … do' … do
    this.ui.buttons([{ id: 'do', label: 'Hear do' }, { id: 'restart', label: 'Start again' }]);
    this.ui.prompt(`Start on <b>do</b>, sing up the scale and back down, and land on the same do.`);
    this.show();
    this.env.play([{ notes: [t], dur: 1.6 }]);
  }
  show() {
    // one half at a time, so the notes stay big enough to read: going up, then coming down
    const half = this.i < 8 ? 0 : 1;
    const idx = half === 0 ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 8, 9, 10, 11, 12, 13, 14];
    this.env.staff.setExercise({ key: this.key, items: idx.map((j) => {
      const r = this.results[j];
      return { midi: this.seq[j], state: r ? r.state : j === this.i ? 'current' : 'pending', label: r ? signed(r.cents) : this.env.sol(this.seq[j], this.key),
        labelColor: r ? undefined : undefined };
    }) });
  }
  held(note, cents) {
    if (this.done) return;
    if (note !== this.seq[this.i]) return;
    this.results[this.i] = { cents, state: cls(cents, this.tol) };
    this.i++;
    if (this.i >= this.seq.length) return this.finish(cents);
    this.show();
  }
  finish(lastCents) {
    this.done = true; this.show();
    const firstC = this.results[0].cents;
    const worst = this.results.reduce((a, r, j) => (Math.abs(r.cents) > Math.abs(a.cents) ? { cents: r.cents, j } : a), { cents: 0, j: 0 });
    this.total++; if (Math.abs(lastCents) <= this.tol) this.right++;
    this.score();
    const back = lastCents === 0 ? 'exactly in tune' : `${Math.abs(lastCents)} cents ${lastCents > 0 ? 'sharp' : 'flat'}`;
    this.ui.prompt(`You started ${signed(firstC)} and landed ${back}. Furthest off: ${this.env.sol(this.seq[worst.j], this.key)} (${signed(worst.cents)}).`);
    this.ui.buttons([{ id: 'do', label: 'Hear do' }, { id: 'restart', label: 'Again', primary: true }]);
  }
  button(id) {
    if (id === 'do') this.env.play([{ notes: [this.tonic], dur: 1.6 }]);
    if (id === 'restart') this.next();
  }
}

// ---------- Train your ear ----------

class ScaleDegrees extends Exercise {
  get needsMic() { return false; }
  start() { this.next(); }
  next() {
    const key = this.opts.keyMode === 'random' ? this.env.randomKey() : this.env.key();
    const scale = scaleOf(key);
    const place = chooseTonic(key, 52, 64); // piano cadence in a clear middle register
    const t = place ? place.t : 60;
    const degrees = this.opts.set === 'triad' ? [1, 3, 5] : [1, 2, 3, 4, 5, 6, 7];
    const degree = pick(this.env.rng, degrees);
    const midi = t + scale[degree - 1] + (degree === 1 && this.env.rng() < 0.5 ? 12 : 0);
    Object.assign(this, { key, t, scale, degree, midi, degrees, answered: false });
    this.env.staff.setExercise({ key, items: [{ midi: null, state: 'hidden' }] });
    this.ui.prompt('Listen to the key, then the note. Which scale degree is it?');
    this.ui.answers(SOL_ALL.map((s, i) => ({ value: i + 1, label: `${i + 1}`, sub: key.mode === 'minor' ? ['do', 're', 'me', 'fa', 'sol', 'le', 'te'][i] : s, disabled: !degrees.includes(i + 1) })));
    this.ui.buttons([{ id: 'note', label: 'Hear note' }, { id: 'cadence', label: 'Hear key' }, { id: 'next', label: 'Next' }]);
    this.playQuestion();
  }
  cadence() {
    const { t, scale } = this, d = (n) => t + 12 * Math.floor(n / 7) + scale[((n % 7) + 7) % 7];
    // I – IV – V – I with a bass line, in close position
    return [
      { notes: [t - 12, d(0), d(2), d(4)], dur: 0.55 }, { notes: [t - 7, d(0), d(3), d(5)], dur: 0.55 },
      { notes: [t - 5, d(-1), d(1), d(4)], dur: 0.55 }, { notes: [t - 12, d(0), d(2), d(4)], dur: 0.9, gap: 0.45 },
    ];
  }
  playQuestion() { return this.env.play([...this.cadence(), { notes: [this.midi], dur: 1.1 }]); }
  answer(v) {
    if (this.answered) return;
    this.answered = true;
    const ok = v === this.degree;
    this.total++; if (ok) this.right++;
    this.score();
    const sol = this.env.sol(this.midi, this.key);
    this.env.staff.setExercise({ key: this.key, items: [{ midi: this.midi, state: ok ? 'good' : 'off', label: `${this.degree} ${sol}` }] });
    this.ui.prompt(ok ? `✓ ${this.degree} (${sol}). Now hear it resolve home.` : `That was ${this.degree} (${sol}), not ${v}. Hear it resolve home.`);
    this.ui.answers(null);
    this.ui.buttons([{ id: 'note', label: 'Hear note' }, { id: 'next', label: 'Next', primary: true }]);
    this.env.play(this.resolution().map((m, i, a) => ({ notes: [m], dur: i === a.length - 1 ? 0.9 : 0.42 })));
  }
  /** The note walks to the nearest do (2→1, 3→2→1, 4→3→2→1, 5→6→7→1, 6→7→1, 7→1): the key's pull, made audible. */
  resolution() {
    const d = this.degree - 1, base = this.midi - this.scale[d];
    const path = d === 0 ? [0] : d <= 3 ? Array.from({ length: d + 1 }, (_, i) => d - i) : Array.from({ length: 8 - d }, (_, i) => d + i);
    return path.map((x) => base + 12 * Math.floor(x / 7) + this.scale[x % 7]);
  }
  button(id) {
    if (id === 'note') this.env.play([{ notes: [this.midi], dur: 1.1 }]);
    if (id === 'cadence') this.env.play(this.cadence());
    if (id === 'next') this.next();
  }
}

// Absolute pitch training: name a note with no reference. Starts with three notes and adds one each
// time you get 9 of the last 10 right (20 answers at least), as the adult training studies do.
const AP_ORDER = [0, 7, 4, 9, 2, 5, 11, 6, 10, 3, 8, 1];
const PC_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
class NoteNaming extends Exercise {
  get needsMic() { return false; }
  start() {
    this.prog = this.env.load('ap', { pool: 3, recent: [] });
    this.next();
  }
  get pool() { return AP_ORDER.slice(0, this.prog.pool); }
  next() {
    let pc = pick(this.env.rng, this.pool);
    if (pc === this.lastPc && this.pool.length > 1) pc = pick(this.env.rng, this.pool.filter((p) => p !== pc));
    const octave = pick(this.env.rng, [3, 4]);
    Object.assign(this, { midi: 12 * (octave + 1) + pc, lastPc: pc, answered: false });
    this.env.staff.setExercise({ key: null, items: [{ midi: null, state: 'hidden' }] });
    this.ui.prompt(`Which note is it? Tap it on the piano (any octave).<br><span class="muted">Notes in play: ${this.pool.map((p) => PC_NAMES[p]).join(' · ')}</span>`);
    this.ui.buttons([{ id: 'again', label: 'Hear again' }, { id: 'next', label: 'Skip' }]);
    this.env.play([{ notes: [this.midi], dur: 1.3 }]);
  }
  key(midi) {
    if (this.answered) return;
    this.answered = true;
    const ok = ((midi - this.midi) % 12 + 12) % 12 === 0;
    this.total++; if (ok) this.right++;
    this.score();
    this.prog.recent = [...this.prog.recent, ok ? 1 : 0].slice(-20);
    let news = '';
    const last10 = this.prog.recent.slice(-10);
    if (this.prog.recent.length >= 20 && last10.reduce((a, b) => a + b, 0) >= 9 && this.prog.pool < 12) {
      this.prog.pool++; this.prog.recent = [];
      news = ` New note added: <b>${PC_NAMES[AP_ORDER[this.prog.pool - 1]]}</b>.`;
    }
    this.env.save('ap', this.prog);
    const items = [{ midi: this.midi, state: ok ? 'good' : 'given', label: PC_NAMES[this.midi % 12] }];
    if (!ok) items.push({ midi, state: 'off', label: PC_NAMES[((midi % 12) + 12) % 12] });
    this.env.staff.setExercise({ key: null, items });
    this.ui.prompt((ok ? `✓ ${PC_NAMES[this.midi % 12]}.` : `That was ${PC_NAMES[this.midi % 12]} (you tapped ${PC_NAMES[((midi % 12) + 12) % 12]}).`) + news);
    if (!ok) setTimeout(() => this.env.play([{ notes: [this.midi], dur: 1.0 }]), 700);
    this.ui.buttons([{ id: 'again', label: 'Hear it' }, { id: 'next', label: 'Next', primary: true }]);
    clearTimeout(this.auto);
    if (ok) this.auto = setTimeout(() => { if (!this.stopped && this.answered) this.next(); }, 1400);
  }
  button(id) {
    if (id === 'again') this.env.play([{ notes: [this.midi], dur: 1.2 }]);
    if (id === 'next') { clearTimeout(this.auto); this.next(); }
  }
  stop() { super.stop(); clearTimeout(this.auto); }
}

// ---------- Tools ----------

class HeldNote extends Exercise {
  start() {
    this.env.view('graph');
    this.frames = []; this.note = null; this.history = [];
    this.ui.prompt('Sing and hold any note for 2 seconds or more.');
    this.ui.buttons([]);
  }
  live(note, cents, dt, line, centre, t) {
    if (note != null && line != null && centre != null && (this.note === null || Math.abs(centre - this.note) < 1.2)) {
      if (this.note === null) this.note = note;
      this.frames.push({ t, m: line, c: centre });
      if (this.frames.length % 30 === 0) this.ui.prompt(`Holding ${this.env.name(this.note, this.env.key())}… ${(t - this.frames[0].t).toFixed(1)} s`);
      return;
    }
    if (this.frames.length) this.finishNote();
    if (note != null && centre != null) { this.note = note; this.frames = [{ t, m: line, c: centre }]; }
  }
  finishNote() {
    const fr = this.frames; this.frames = []; this.note = null;
    if (fr.length < 90) { this.ui.prompt('Hold it a little longer — 2 seconds or more.'); return; }
    const r = analyzeHeldNote(fr);
    if (!r) return;
    this.history.unshift(r);
    const name = this.env.name(r.note, this.env.key());
    const vib = r.vibrato ? `vibrato <b>${r.rate} Hz</b>, <b>±${r.extent}¢</b>` : 'no clear vibrato (straight tone)';
    const drift = Math.abs(r.drift) < 5 ? 'steady' : `drifted ${Math.abs(r.drift)}¢ ${r.drift > 0 ? 'sharp' : 'flat'}`;
    this.ui.prompt(`<b>${name}</b> · ${r.duration} s · on average ${signed(r.meanCents)} · ${drift} · ${vib}`
      + `<br><span class="muted">Classical singers typically measure about 5–7 Hz and ±35–120¢ (average around ±70¢).</span>`);
  }
}

// ---------- catalogue ----------

const LEVEL_CHOICES = LEVELS.map((l) => [l.n, `${l.n}`]);
export const EXERCISES = [
  { id: 'sight', tab: 'sing', title: 'Sight-singing', blurb: 'A short melody on the staff. Sing it note by note.',
    why: 'The app plays do so you have the key, then each note turns green as you sing it. Levels follow the order aural-skills courses use: steps first, then leaps within the tonic chord, then the dominant chord, then wider leaps and chromatic notes.',
    options: [{ key: 'level', label: 'Level', choices: LEVEL_CHOICES, hintFrom: LEVELS }, { key: 'length', label: 'Notes', choices: [[4, '4'], [6, '6'], [8, '8']] },
      { key: 'keyMode', label: 'Key', choices: [['mine', 'My key'], ['random', 'Random']] }],
    defaults: { level: 1, length: 6, keyMode: 'mine' }, make: (e, o) => new SightSinging(e, o) },
  { id: 'intervals', tab: 'sing', title: 'Intervals', blurb: 'Sing a given interval up or down from a note.',
    why: 'You hear and see the starting note, then sing the interval (singing the start note first is fine). The answer appears on the staff when you get it.',
    options: [{ key: 'set', label: 'Intervals', choices: [['basic', '2nd 3rd 4th 5th 8ve'], ['all', 'All']] }, { key: 'dir', label: 'Direction', choices: [['up', 'Up'], ['down', 'Down'], ['both', 'Both']] }],
    defaults: { set: 'basic', dir: 'up' }, make: (e, o) => new Intervals(e, o) },
  { id: 'echo', tab: 'sing', title: 'Echo', blurb: 'Hear a short tune, then sing it back from memory.',
    why: 'Builds tonal memory: holding a melody in your head and reproducing it. The tune stays hidden and each note appears as you sing it right; then you see it on the staff.',
    options: [{ key: 'level', label: 'Level', choices: LEVEL_CHOICES, hintFrom: LEVELS }, { key: 'length', label: 'Notes', choices: [[3, '3'], [4, '4'], [5, '5'], [6, '6']] }],
    defaults: { level: 1, length: 3 }, make: (e, o) => new Echo(e, o) },
  { id: 'match', tab: 'sing', title: 'Pitch matching', blurb: 'Hear a note and sing it back, in tune.',
    why: 'The basic singing skill, with live feedback (studies of real-time visual feedback mostly found it helps pitch matching). "From memory" adds a 4-second wait, which trains pitch memory.',
    options: [{ key: 'mode', label: 'Mode', choices: [['match', 'Right away'], ['memory', 'From memory']] }],
    defaults: { mode: 'match' }, make: (e, o) => new PitchMatch(e, o) },
  { id: 'scale', tab: 'sing', title: 'Scale & return', blurb: 'Sing up the scale and back down. Do you land on the same do?',
    why: 'Shows how in tune each step is and how far you drift by the time you return — a classic test of steady intonation and pitch memory.',
    options: [], defaults: {}, make: (e, o) => new ScaleReturn(e, o) },
  { id: 'degrees', tab: 'ear', title: 'Scale degrees', blurb: 'Hear the key, then a note. Which degree is it?',
    why: 'Relative pitch, the way functional ear training does it: a cadence sets the key, you name the note’s place in it (do, re, mi…), then hear it walk home to do. This is the skill sight-singing rests on.',
    options: [{ key: 'set', label: 'Notes', choices: [['triad', 'do mi sol'], ['all', 'All seven']] }, { key: 'keyMode', label: 'Key', choices: [['mine', 'My key'], ['random', 'Random']] }],
    defaults: { set: 'triad', keyMode: 'mine' }, make: (e, o) => new ScaleDegrees(e, o) },
  { id: 'naming', tab: 'ear', title: 'Note naming', blurb: 'Perfect-pitch training: name a note with no reference.',
    why: 'Starts with three notes and adds one when you get 9 of the last 10 right. Honest expectations: in a 2019 study, a few adults reached perfect-pitch-level accuracy after 8 weeks, but most did not, and later research disputes how real those gains are. Relative pitch (the other exercises) is the reliable win.',
    options: [], defaults: {}, make: (e, o) => new NoteNaming(e, o) },
  { id: 'held', tab: 'tools', title: 'Held note', blurb: 'Hold a note: see your vibrato, tuning and steadiness.',
    why: 'Measures vibrato speed (Hz) and width (± cents), average tuning, and drift for each sustained note, next to typical values for classical singers.',
    options: [], defaults: {}, make: (e, o) => new HeldNote(e, o) },
];
export const exerciseById = (id) => EXERCISES.find((x) => x.id === id);
export { noteName, degreeOf, KEYS };
