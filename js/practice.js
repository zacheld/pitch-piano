// Practice exercises. Each one talks to the app only through `env` (see app.js):
//   env.key() practice key (random unless the user chose "my key") · env.range() comfortable range · env.full() whole voice
//   env.tol() cents allowed · env.rng() · env.play(seq, { listen }) → Promise (mic ignored while it plays unless listen)
//   env.tone(midi, seconds) pure sine reference · env.staff (StaffView) · env.view('staff'|'graph')
//   env.ui.{title, score, question, prompt, buttons, answers} · env.name(midi, key) · env.sol(midi, key)
//   env.load(id, def) / env.save(id, data) · env.diag() · env.setCalibration(cents)
// The app feeds frame(t, note, cents, line, centre) about 60×/s while listening (note = null in silence
// or while a prompt plays), key(midi) for piano taps, button(id) and answer(value) for the on-screen controls.
// Every exercise has three levels: easy, medium, hard.

import { generateMelody, chooseTonic, degreeMidi } from './melody.js';
import { KEYS, INTERVALS, spell, intervalFrom, intervalName, scaleOf, noteName, degreeOf } from './notation.js';
import { Transcriber, analyzeHeldNote } from './analysis.js';

const cls = (cents, tol) => (Math.abs(cents) <= Math.min(10, tol) ? 'good' : Math.abs(cents) <= tol ? 'near' : 'off');
const signed = (c) => (c > 0 ? '+' : c < 0 ? '−' : '±') + Math.abs(c) + '¢';
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SOL_ALL = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'];
export const LEVEL_NAMES = [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']];

export class Exercise {
  constructor(env, opts = {}) {
    this.env = env; this.opts = opts; this.ui = env.ui; this.tol = env.tol();
    this.level = opts.level || 'medium';
    this.catcher = new Transcriber({ minHold: 0.45, skip: 0.15 }); // judge the settled pitch, not the scoop into it
    this.lastT = 0; this.stopped = false;
    this.right = 0; this.total = 0;
  }
  /** Results for the feedback summary (the app keeps them for this run of the exercise). */
  log(entry) { if (this.env.log) this.env.log(entry); }
  get needsMic() { return true; }
  get hearsItself() { return false; }
  frame(t, note, cents, line, centre) {
    const dt = this.lastT ? Math.min(0.1, t - this.lastT) : 0;
    this.lastT = t;
    this.live(note, cents, dt, line, centre, t);
    const ev = this.catcher.feed(t, note, cents);
    if (!ev) return;
    if (ev.type === 'write') this.judge(ev, ev.cents, t);
    else if (this.expecting && ev.since !== this.usedUp) {
      // The right note, held but not in tune when it was first judged: keep checking where it has
      // settled (the last ~0.35 s) for as long as it's held, so a steady ✓ always moves you on.
      const want = this.expecting();
      if (want && want.midi === ev.note && Math.abs(ev.recent) <= this.tol) this.judge(ev, ev.recent, t);
    }
  }
  /** Passes a sung note to held(); if that moved the exercise on, the note is used up (it can't also count
   *  for the next target, e.g. a repeated note). */
  judge(ev, cents, t) {
    this.lastEv = ev;
    const before = this.expecting ? this.expecting() : null;
    this.held(ev.note, cents, t);
    if (this.expecting && this.expecting() !== before) this.usedUp = ev.since;
  }
  /** Feedback: one sung note, judged against its target (cents = where it settled). Records the onset too,
   *  so a scoop from below can be reported. */
  logPitch(midi, cents, extra = {}) {
    const ev = this.lastEv;
    const scoop = ev && ev.early != null && ev.note === midi ? Math.round(cents - ev.early) : null; // > 0: started below
    this.log({ kind: 'pitch', midi, cents: Math.round(cents), scoop, ...extra });
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
  /** Arrow next to a target: which way to go from what you're singing. */
  static arrow(note, cents, target, tol) {
    if (note == null) return null;
    const off = (note - target) * 100 + cents;
    if (Math.abs(off) <= tol) return 'ok';
    return off < 0 ? 'up' : 'down';
  }
}

// ---------- Sing what you see ----------

const SIGHT = { easy: { level: 2, length: 6 }, medium: { level: 3, length: 8 }, hard: { level: 5, length: 8 } };
class SightSinging extends Exercise {
  start() { this.next(); }
  next() {
    const key = this.env.key();
    const { low, high } = this.env.range();
    const cfg = SIGHT[this.level];
    const level = this.level === 'medium' ? pick(this.env.rng, [3, 4]) : cfg.level;
    const m = generateMelody({ key, level, length: cfg.length, low, high, rng: this.env.rng });
    if (!m) return this.ui.question('Your practice range is too narrow. Widen it in Settings → Practice.');
    Object.assign(this, { key, tonic: m.tonic, i: 0, done: false });
    this.notes = m.notes.map((n) => ({ midi: n.midi, state: 'pending', first: true, sung: [], arrow: null }));
    this.notes[0].state = 'current';
    this.show();
    this.ui.question(`${key.name} — sing the melody.`);
    this.ui.prompt('Listen for do first.');
    this.ui.buttons([{ id: 'do', label: 'Hear do' }, { id: 'melody', label: 'Hear melody' }, { id: 'skip', label: 'Skip note' }, { id: 'new', label: 'New melody' }]);
    this.keyIntro(key, m.tonic).then(() => { if (!this.done && !this.stopped && this.key === key) this.ui.prompt(''); });
  }
  expecting() { return this.done ? null : this.notes[this.i]; }
  show() {
    this.env.staff.setExercise({ key: this.key, items: this.notes.map((n) => ({
      midi: n.midi, state: n.state, sung: n.sung, arrow: n.arrow,
      label: this.done ? this.env.sol(n.midi, this.key) : null,
    })) });
  }
  live(note, cents) {
    if (this.done) return;
    const cur = this.notes[this.i];
    if (this.env.hideLive()) { if (cur.arrow || cur.sung.length) { cur.arrow = null; cur.sung = []; this.show(); } return; }
    const a = Exercise.arrow(note, cents, cur.midi, this.tol);
    const sung = note == null || note === cur.midi ? [] : [{ midi: note, cls: 'off' }];
    if (a !== cur.arrow || JSON.stringify(sung) !== JSON.stringify(cur.sung)) { cur.arrow = a; cur.sung = sung; this.show(); }
  }
  held(note, cents) {
    if (this.done) return;
    const cur = this.notes[this.i];
    if (note === cur.midi && Math.abs(cents) <= this.tol) {
      cur.state = cls(cents, this.tol); cur.sung = []; cur.arrow = null;
      this.total++; if (cur.first) this.right++;
      this.logPitch(cur.midi, cents, { first: cur.first });
      this.advance();
    } else if (note !== cur.midi) { cur.first = false; this.log({ kind: 'wrong' }); }
    this.score();
  }
  advance() {
    this.i++;
    if (this.i >= this.notes.length) return this.finish();
    this.notes[this.i].state = 'current';
    this.show();
  }
  finish() {
    this.done = true; this.show();
    const first = this.notes.filter((n) => n.first).length;
    this.ui.prompt(`Done — ${first} of ${this.notes.length} right first time.`);
    this.ui.buttons([{ id: 'melody', label: 'Hear it' }, { id: 'new', label: 'Next melody', primary: true }]);
  }
  button(id) {
    if (id === 'do') this.keyIntro(this.key, this.tonic);
    if (id === 'melody') this.env.play(this.notes.map((n) => ({ notes: [n.midi], dur: 0.55, gap: 0.05 })));
    if (id === 'skip' && !this.done) { const c = this.notes[this.i]; c.state = 'off'; c.first = false; c.sung = []; c.arrow = null; this.total++; this.score(); this.advance(); }
    if (id === 'new') this.next();
  }
}

const IV_SETS = { easy: ['M2', 'M3', 'P4', 'P5', 'P8'], medium: INTERVALS.map((i) => i.id), hard: INTERVALS.map((i) => i.id) };
class Intervals extends Exercise {
  start() { this.next(); }
  next() {
    const set = INTERVALS.filter((i) => IV_SETS[this.level].includes(i.id));
    const iv = pick(this.env.rng, set);
    const dir = this.level === 'easy' ? 1 : pick(this.env.rng, [1, -1]);
    const { low, high } = this.env.range();
    const starts = [];
    for (let m = low; m <= high; m++) if (m + dir * iv.semis >= low && m + dir * iv.semis <= high) starts.push(m);
    if (!starts.length) return this.ui.question('Your practice range is too narrow. Widen it in Settings → Practice.');
    const key = this.env.key();
    const s = spell(pick(this.env.rng, starts), key);
    const target = intervalFrom(s, iv, dir);
    Object.assign(this, { key, iv, dir, start: s.midi, target: target.midi, goal: { midi: target.midi }, done: false, first: true });
    // hard: the start note is only heard, not shown
    this.items = this.level === 'hard' ? [{ midi: null, state: 'hidden' }, { midi: null, state: 'hidden', sung: [] }]
      : [{ midi: s.midi, state: 'given', label: this.env.name(s.midi, key) }, { midi: null, state: 'hidden', sung: [] }];
    this.show();
    this.ui.question(`Sing a <b>${iv.name} ${dir > 0 ? 'up' : 'down'}</b>${this.level === 'hard' ? ' from the note you hear' : ` from ${this.env.name(s.midi, key)}`}.`);
    this.ui.prompt('');
    this.ui.buttons([{ id: 'start', label: 'Hear start note' }, { id: 'answer', label: 'Show answer' }, { id: 'next', label: 'Next' }]);
    this.env.play([{ notes: [s.midi], dur: 1.0 }]);
  }
  show() { this.env.staff.setExercise({ key: this.key, items: this.items }); }
  expecting() { return this.done ? null : this.goal; }
  held(note, cents) {
    if (this.done || note === this.start) return; // singing the start note first is fine
    if (note === this.target && Math.abs(cents) <= this.tol) {
      this.reveal(cls(cents, this.tol));
      this.total++; if (this.first) this.right++;
      this.logPitch(this.target, cents, { first: this.first });
      this.ui.prompt(`✓ ${signed(cents)}`);
    } else if (note !== this.target) {
      this.first = false; this.log({ kind: 'wrong' });
      const semis = note - this.start;
      this.items[1].sung = [{ midi: note, cls: 'off' }];
      this.show();
      this.ui.prompt(`That was a ${intervalName(semis)} ${semis > 0 ? 'up' : 'down'} (${this.env.name(note, this.key)}).`);
    }
    this.score();
  }
  reveal(state) {
    this.done = true;
    this.items = [{ midi: this.start, state: 'given', label: this.env.name(this.start, this.key) },
      { midi: this.target, state, label: this.env.name(this.target, this.key), sung: [] }];
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

// ---------- Sing what you hear ----------

const ECHO = { easy: { level: 2, length: 4 }, medium: { level: 4, length: 5 }, hard: { level: 5, length: 7 } };
class Echo extends Exercise {
  start() { this.next(); }
  next() {
    const key = this.env.key();
    const { low, high } = this.env.range();
    const cfg = ECHO[this.level];
    const m = generateMelody({ key, level: cfg.level, length: cfg.length, low, high, rng: this.env.rng });
    if (!m) return this.ui.question('Your practice range is too narrow. Widen it in Settings → Practice.');
    Object.assign(this, { key, i: 0, done: false, clean: true });
    this.notes = m.notes.map((n) => ({ midi: n.midi, state: 'hidden', sung: [] }));
    this.show();
    this.ui.question(`Listen, then sing it back (${this.notes.length} notes).`);
    this.ui.prompt('');
    this.ui.buttons([{ id: 'again', label: 'Hear again' }, { id: 'answer', label: 'Show answer' }, { id: 'new', label: 'New tune' }]);
    this.playAll();
  }
  playAll() { return this.env.play(this.notes.map((n) => ({ notes: [n.midi], dur: 0.55, gap: 0.06 }))); }
  expecting() { return this.done ? null : this.notes[this.i]; }
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
      this.logPitch(cur.midi, cents);
      this.i++;
      if (this.i >= this.notes.length) return this.finish(true);
    } else if (note !== cur.midi) {
      this.clean = false; this.log({ kind: 'wrong' });
      cur.sung = [{ midi: note, cls: 'off' }];
    }
    this.show();
  }
  finish(byEar) {
    this.done = true;
    this.total++; if (byEar && this.clean) this.right++;
    this.score();
    for (const n of this.notes) { if (n.state === 'hidden') n.state = 'given'; n.sung = []; }
    this.show();
    this.ui.prompt(byEar ? (this.clean ? '✓ Every note right first time.' : '✓ Got it.') : 'Here it is.');
    this.ui.buttons([{ id: 'again', label: 'Hear again' }, { id: 'new', label: 'New tune', primary: true }]);
  }
  button(id) {
    if (id === 'again') this.playAll();
    if (id === 'answer' && !this.done) this.finish(false);
    if (id === 'new') this.next();
  }
}

// Pitch memory: hear a note, then (medium/hard) other notes get in the way, then sing the first note.
class PitchMatch extends Exercise {
  start() { this.next(); }
  next() {
    const { low, high } = this.env.range();
    const target = low + Math.floor(this.env.rng() * (high - low + 1));
    Object.assign(this, { target, on: 0, sum: 0, n: 0, done: false, first: true, ready: false, key: this.env.key(), token: {} });
    const token = this.token;
    this.items = [{ midi: null, state: 'hidden', sung: [] }];
    this.show();
    this.ui.question({ easy: 'Remember this note, then sing it after a short pause.', medium: 'Remember this note. Other notes will play — then sing the first one.',
      hard: 'Remember this note. A tune in another key will play — then sing the first note.' }[this.level]);
    this.ui.prompt('Listen…');
    this.ui.buttons([{ id: 'again', label: 'Hear again' }, { id: 'next', label: 'Next' }]);
    this.env.play([{ notes: [target], dur: 1.2, gap: 0.4 }, ...this.distractors(target, low, high)]).then(async (ok) => {
      if (!ok || this.stopped || this.token !== token) return;
      if (this.level === 'easy') { this.ui.prompt('…'); await sleep(3000); if (this.token !== token) return; }
      this.ready = true; this.ui.prompt('Now sing it and hold it.');
    });
  }
  /** Notes in between that never include the target's pitch class (so it has to be remembered). */
  distractors(target, low, high) {
    if (this.level === 'easy') return [];
    const key = this.level === 'medium' ? this.key : KEYS[Math.floor(this.env.rng() * KEYS.length)];
    const m = generateMelody({ key, level: this.level === 'medium' ? 3 : 4, length: this.level === 'medium' ? 5 : 7, low, high, rng: this.env.rng });
    const notes = (m ? m.notes.map((n) => n.midi) : [low + 2, low + 5, low + 9]).filter((x) => (x - target) % 12 !== 0);
    return notes.map((x) => ({ notes: [x], dur: 0.38, gap: 0.04 }));
  }
  show() { this.env.staff.setExercise({ key: this.key, items: this.items }); }
  live(note, cents, dt) {
    if (this.done || !this.ready) { this.on = 0; this.sum = this.n = 0; return; }
    const a = Exercise.arrow(note, cents, this.target, this.tol);
    // a second of ✓ in all, counting back down while it's off, so a moment's wobble doesn't start it over
    if (a === 'ok') {
      this.on += dt; this.sum += (note - this.target) * 100 + cents; this.n++;
      if (this.on >= 1.0) return this.success(Math.round(this.sum / this.n));
    } else this.on = Math.max(0, this.on - dt);
    if (note == null && this.on === 0) { this.sum = this.n = 0; }
    const shown = this.env.hideLive() ? null : a;
    if (shown !== this.items[0].arrow) { this.items[0].arrow = shown; this.show(); }
  }
  held(note) { if (this.ready && !this.done && note !== this.target) { this.first = false; this.log({ kind: 'wrong' }); } }
  success(cents) {
    this.done = true;
    this.total++; if (this.first) this.right++;
    this.log({ kind: 'pitch', midi: this.target, cents, first: this.first });
    this.score();
    this.items = [{ midi: this.target, state: cls(cents, this.tol), label: this.env.name(this.target, this.key), sung: [] }];
    this.show();
    this.ui.prompt(`✓ ${signed(cents)}`);
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
    if (!place || place.t + 12 > high) return this.ui.question('Your voice range needs at least an octave for this. Check Settings → Practice.');
    const scale = scaleOf(key), t = place.t;
    const up = [0, 1, 2, 3, 4, 5, 6, 7].map((d) => degreeMidi(t, scale, d));
    Object.assign(this, { key, tonic: t, i: 0, done: false, results: [] });
    this.seq = [...up, ...up.slice(0, 7).reverse()]; // do … do' … do
    this.ui.question(`${key.name}: start on <b>do</b>, sing up the scale and back down, and land on the same do.`);
    this.ui.prompt('');
    this.ui.buttons([{ id: 'do', label: 'Hear do' }, { id: 'restart', label: 'Start again' }]);
    this.show();
    this.env.play([{ notes: [t], dur: 1.6 }]);
  }
  show() {
    const idx = this.i < 8 ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 8, 9, 10, 11, 12, 13, 14];
    this.env.staff.setExercise({ key: this.key, items: idx.map((j) => {
      const r = this.results[j];
      return { midi: this.seq[j], state: r ? r.state : j === this.i ? 'current' : 'pending', label: r ? signed(r.cents) : this.env.sol(this.seq[j], this.key) };
    }) });
  }
  held(note, cents) {
    if (this.done || note !== this.seq[this.i]) return;
    this.results[this.i] = { cents, state: cls(cents, this.tol) };
    this.logPitch(note, cents, { dir: this.i === 0 ? null : this.i < 8 ? 'up' : 'down' });
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
    const back = lastCents === 0 ? 'exactly in tune' : `${Math.abs(lastCents)}¢ ${lastCents > 0 ? 'sharp' : 'flat'}`;
    this.ui.prompt(`Started ${signed(firstC)}, landed ${back}. Furthest off: ${this.env.sol(this.seq[worst.j], this.key)} (${signed(worst.cents)}).`);
    this.ui.buttons([{ id: 'do', label: 'Hear do' }, { id: 'restart', label: 'Again', primary: true }]);
  }
  button(id) {
    if (id === 'do') this.env.play([{ notes: [this.tonic], dur: 1.6 }]);
    if (id === 'restart') this.next();
  }
}

// ---------- Ear training ----------

class ScaleDegrees extends Exercise {
  get needsMic() { return false; }
  start() { this.n = 0; this.next(); }
  next() {
    // hard: the key is set once, then notes come without a cadence each time (you hold the key in your head)
    const newKey = !this.key || this.level !== 'hard' || this.n % 8 === 0;
    if (newKey) {
      this.key = this.env.key();
      this.scale = scaleOf(this.key);
      const place = chooseTonic(this.key, 52, 64);
      this.t = place ? place.t : 60;
    }
    this.n++;
    const degrees = this.level === 'easy' ? [1, 3, 5] : [1, 2, 3, 4, 5, 6, 7];
    let degree = pick(this.env.rng, degrees);
    if (degree === this.degree && degrees.length > 1) degree = pick(this.env.rng, degrees.filter((d) => d !== degree));
    this.degree = degree; this.degrees = degrees; this.answered = false;
    this.midi = this.t + this.scale[degree - 1] + (degree === 1 && this.env.rng() < 0.5 ? 12 : 0);
    this.env.staff.setExercise({ key: this.key, items: [{ midi: null, state: 'hidden' }] });
    this.ui.question(`${this.key.name}: which scale degree is the note?`);
    this.ui.prompt(newKey ? '' : 'Same key — no cadence this time.');
    this.ui.answers(SOL_ALL.map((s, i) => ({ value: i + 1, label: `${i + 1}`, sub: this.key.mode === 'minor' ? ['do', 're', 'me', 'fa', 'sol', 'le', 'te'][i] : s, disabled: !degrees.includes(i + 1) })));
    this.ui.buttons([{ id: 'note', label: 'Hear note' }, { id: 'cadence', label: 'Hear key' }, { id: 'next', label: 'Skip' }]);
    this.env.play([...(newKey || this.level !== 'hard' ? this.cadence() : []), { notes: [this.midi], dur: 1.1 }]);
  }
  cadence() {
    const { t, scale } = this, d = (n) => t + 12 * Math.floor(n / 7) + scale[((n % 7) + 7) % 7];
    return [
      { notes: [t - 12, d(0), d(2), d(4)], dur: 0.55 }, { notes: [t - 7, d(0), d(3), d(5)], dur: 0.55 },
      { notes: [t - 5, d(-1), d(1), d(4)], dur: 0.55 }, { notes: [t - 12, d(0), d(2), d(4)], dur: 0.9, gap: 0.45 },
    ];
  }
  answer(v) {
    if (this.answered) return;
    this.answered = true;
    const ok = v === this.degree;
    this.total++; if (ok) this.right++;
    this.score();
    const sol = this.env.sol(this.midi, this.key);
    this.env.staff.setExercise({ key: this.key, items: [{ midi: this.midi, state: ok ? 'good' : 'off', label: `${this.degree} ${sol}` }] });
    this.ui.prompt(ok ? `✓ ${this.degree} (${sol})` : `✗ It was ${this.degree} (${sol}).`);
    this.ui.answers(null);
    this.ui.buttons([{ id: 'note', label: 'Hear note' }, { id: 'next', label: 'Next', primary: true }]);
    this.env.play(this.resolution().map((m, i, a) => ({ notes: [m], dur: i === a.length - 1 ? 0.9 : 0.42 })));
  }
  /** The note walks to the nearest do (2→1, 3→2→1, 4→3→2→1, 5→6→7→1, 6→7→1, 7→1). */
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

// Absolute pitch training: name a note with no reference.
const PC_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const NAMING = {
  easy: { pcs: [0, 2, 4, 5, 7, 9, 11], octaves: [3, 4], hint: 'White keys only.' },
  medium: { pcs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], octaves: [3, 4], hint: 'All 12 notes.' },
  hard: { pcs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], octaves: [2, 3, 4, 5], hint: 'All 12 notes, across four octaves.' },
};
class NoteNaming extends Exercise {
  get needsMic() { return false; }
  start() { this.cfg = NAMING[this.level]; this.next(); }
  next() {
    let pc = pick(this.env.rng, this.cfg.pcs);
    if (pc === this.lastPc) pc = pick(this.env.rng, this.cfg.pcs.filter((p) => p !== pc));
    const octave = pick(this.env.rng, this.cfg.octaves);
    Object.assign(this, { midi: 12 * (octave + 1) + pc, lastPc: pc, answered: false });
    this.env.staff.setExercise({ key: null, items: [{ midi: null, state: 'hidden' }] });
    this.ui.question('Which note is it? Tap it on the piano (any octave).');
    this.ui.prompt(`<span class="muted">${this.cfg.hint}</span>`);
    this.ui.buttons([{ id: 'again', label: 'Hear again' }, { id: 'next', label: 'Skip' }]);
    this.env.play([{ notes: [this.midi], dur: 1.3 }]);
  }
  key(midi) {
    if (this.answered) return;
    this.answered = true;
    const ok = ((midi - this.midi) % 12 + 12) % 12 === 0;
    this.total++; if (ok) this.right++;
    this.score();
    const items = [{ midi: this.midi, state: ok ? 'good' : 'given', label: PC_NAMES[this.midi % 12] }];
    if (!ok) items.push({ midi, state: 'off', label: PC_NAMES[((midi % 12) + 12) % 12] });
    this.env.staff.setExercise({ key: null, items });
    this.ui.prompt(ok ? `✓ ${PC_NAMES[this.midi % 12]}` : `✗ It was ${PC_NAMES[this.midi % 12]}.`);
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
    this.frames = []; this.note = null;
    this.ui.question('Sing and hold any note for 2 seconds or more.');
    this.ui.prompt('');
    this.ui.buttons([]);
  }
  live(note, cents, dt, line, centre, t) {
    if (note != null && line != null && centre != null && (this.note === null || Math.abs(centre - this.note) < 1.2)) {
      if (this.note === null) this.note = note;
      this.frames.push({ t, m: line, c: centre });
      return;
    }
    if (this.frames.length) this.finishNote();
    if (note != null && centre != null) { this.note = note; this.frames = [{ t, m: line, c: centre }]; }
  }
  finishNote() {
    const fr = this.frames; this.frames = []; this.note = null;
    if (fr.length < 90) return;
    const r = analyzeHeldNote(fr);
    if (!r) return;
    const name = this.env.name(r.note, null);
    const vib = r.vibrato ? `vibrato <b>${r.rate} Hz</b>, <b>±${r.extent}¢</b>` : 'no clear vibrato (straight tone)';
    const drift = Math.abs(r.drift) < 5 ? 'steady' : `drifted ${Math.abs(r.drift)}¢ ${r.drift > 0 ? 'sharp' : 'flat'}`;
    this.ui.prompt(`<b>${name}</b> · ${r.duration} s · average ${signed(r.meanCents)} · ${drift} · ${vib}`
      + `<br><span class="muted">Classical singers typically measure about 5–7 Hz and ±35–120¢.</span>`);
  }
}

// Plays notes and pure tones and listens to itself, to see whether the phone hears pitch correctly.
class TuningCheck extends Exercise {
  get hearsItself() { return true; }
  start() {
    this.env.view('graph');
    this.ui.question('Tuning check: does this phone hear pitch correctly?');
    this.ui.prompt('Put the phone on a table, keep the room quiet, and tap Start. It plays six notes and listens to itself. Takes about 12 seconds.');
    this.ui.buttons([{ id: 'go', label: 'Start', primary: true }]);
  }
  live(note, cents, dt, line, centre, t) {
    if (this.expect == null || centre == null || t < this.from) return;
    const off = (centre - this.expect) * 100;
    if (Math.abs(off) < 70) this.collect.push(off);
  }
  async run() {
    this.ui.buttons([]);
    const steps = [['tone', 57], ['piano', 60], ['tone', 64], ['piano', 67], ['tone', 69], ['piano', 72]];
    const res = { tone: [], piano: [] };
    for (const [kind, midi] of steps) {
      if (this.stopped) return;
      this.ui.prompt(`Listening… ${kind === 'tone' ? 'pure tone' : 'piano'} ${this.env.name(midi, null)}`);
      this.collect = []; this.expect = midi; this.from = this.lastT + 0.35;
      if (kind === 'tone') this.env.tone(midi, 1.6); else this.env.play([{ notes: [midi], dur: 1.6 }], { listen: true });
      await sleep(1750);
      this.expect = null;
      if (this.collect.length > 10) {
        const s = [...this.collect].sort((a, b) => a - b);
        res[kind].push(s[s.length >> 1]);
      }
      await sleep(250);
    }
    const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    const tone = avg(res.tone), piano = avg(res.piano);
    const all = avg([...res.tone, ...res.piano]);
    if (all === null) {
      this.ui.prompt('The microphone didn’t hear the notes clearly. Turn the volume up, keep the phone flat on a table, and try again.');
    } else if (Math.abs(all) <= 6) {
      this.ui.prompt(`The phone hears its own notes within a few cents (pure tones ${signed(tone)}, piano ${signed(piano)}). So the measuring is fine: if your singing reads about 30¢ low against the piano, you really are singing a little below it. That’s common — a voice tends to sound higher than a piano at the same pitch, so singers often place their note low.`
        + `<br><span class="muted">${this.env.diag()}</span>`);
      this.result = 0;
    } else {
      this.result = -all;
      this.ui.prompt(`The phone hears its own notes ${signed(all)} off (pure tones ${signed(tone)}, piano ${signed(piano)}). That’s the phone, not you. Correct for it?`
        + `<br><span class="muted">${this.env.diag()}</span>`);
      this.ui.buttons([{ id: 'apply', label: `Correct by ${signed(-all)}`, primary: true }, { id: 'go', label: 'Run again' }]);
      return;
    }
    this.ui.buttons([{ id: 'go', label: 'Run again' }]);
  }
  button(id) {
    if (id === 'go') this.run();
    if (id === 'apply' && this.result) { this.env.setCalibration(this.result); this.ui.prompt(`Done — readings are now corrected by ${signed(this.result)}. Run the check again to confirm.`); this.ui.buttons([{ id: 'go', label: 'Run again' }]); }
  }
}

// ---------- catalogue ----------
// section: where it appears in the menu. levels: shows Easy / Medium / Hard.
export const EXERCISES = [
  { id: 'sight', section: 'sing', title: 'Sight-singing', blurb: 'Read a short melody on the staff and sing it.', levels: true,
    why: 'You hear do, then each note turns green as you sing it. An arrow by the note shows if you’re too high or low. Easy: steps and leaps in the home chord. Medium: leaps in the dominant chord and wider. Hard: wide leaps and notes outside the key.',
    make: (e, o) => new SightSinging(e, o) },
  { id: 'intervals', section: 'sing', title: 'Intervals', blurb: 'Sing a given interval up or down from a note.', levels: true,
    why: 'Easy: 2nds, 3rds, 4ths, 5ths and octaves, upwards. Medium: every interval up to an octave, up and down. Hard: the same, but the starting note is only heard, not shown.',
    make: (e, o) => new Intervals(e, o) },
  { id: 'echo', section: 'sing', title: 'Echo', blurb: 'Hear a short tune, then sing it back from memory.', levels: true,
    why: 'Builds tonal memory. Easy: 4 notes. Medium: 5 notes with wider leaps. Hard: 7 notes, wide leaps and chromatic notes. Each note appears on the staff as you get it.',
    make: (e, o) => new Echo(e, o) },
  { id: 'match', section: 'sing', title: 'Pitch memory', blurb: 'Hear a note, hold it in your head, then sing it.', levels: true,
    why: 'Easy: a 3-second pause before you sing. Medium: other notes in the same key play in between. Hard: a tune in a different key plays in between. The arrow shows higher or lower once you start singing.',
    make: (e, o) => new PitchMatch(e, o) },
  { id: 'scale', section: 'sing', title: 'Scale & return', blurb: 'Up the scale and back down: do you land on the same do?',
    why: 'Shows how in tune each step is and how far you drift by the time you return.',
    make: (e, o) => new ScaleReturn(e, o) },
  { id: 'degrees', section: 'ear', title: 'Scale degrees', blurb: 'Hear the key, then a note: which degree is it?', levels: true,
    why: 'Relative pitch, the functional-ear-training way: a cadence sets the key, you name the note’s place in it, then hear it walk home to do. Easy: do, mi, sol. Medium: all seven. Hard: all seven, and the key is only played every few questions.',
    make: (e, o) => new ScaleDegrees(e, o) },
  { id: 'naming', section: 'ear', title: 'Note naming', blurb: 'Perfect-pitch training: name a note with no reference.', levels: true,
    why: 'Easy: white keys. Medium: all 12 notes. Hard: all 12 across four octaves. Honest expectations: a few adults in a 2019 study reached perfect-pitch accuracy after 8 weeks, most didn’t; relative pitch is the reliable win.',
    make: (e, o) => new NoteNaming(e, o) },
  { id: 'held', section: 'tools', title: 'Held note', blurb: 'Hold a note: see your vibrato, tuning and steadiness.',
    why: 'Measures vibrato speed (Hz) and width (± cents), average tuning, and drift for each sustained note.',
    make: (e, o) => new HeldNote(e, o) },
  { id: 'tuning', section: 'tools', title: 'Tuning check', blurb: 'Does this phone hear pitch correctly? Plays notes and listens to itself.',
    why: 'If your singing always reads off by the same amount, this tells you whether it’s the phone or you. If the phone is off, it can correct for it.',
    make: (e, o) => new TuningCheck(e, o) },
];
export const exerciseById = (id) => EXERCISES.find((x) => x.id === id);
export { noteName, degreeOf, KEYS, sleep, signed, cls };
