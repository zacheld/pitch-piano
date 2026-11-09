// Rhythm practice: counting lesson, tap the rhythm, hear the rhythm, vowel on the beat, metronome.
// Taps on the screen are used for timing (touch is near-instant; microphone clap detection adds delay).
// Extra env used here: env.now() audio clock · env.click(t, accent) · env.wood(t) · env.noteAt(midi, t, dur)
//   env.pad(show) big tap pad (the app calls tap(audioTime)) · env.animate(on) · env.syllables()
//   env.tapOffset()/setTapOffset(ms) · env.micLatency()/setMicLatency(ms)

import { Exercise, sleep } from './practice.js';
import { generateRhythm, barQ, onsets, clicks, scoreTaps, variant, beatsOf } from './rhythm-core.js';

const TOL = { easy: 90, medium: 70, hard: 55 };
const shuffle = (rng, a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

/** Schedules a count-in bar, then the rhythm (woodblock) and/or clicks. Returns the downbeat time of bar 1. */
function schedule(env, r, { rhythm = true, metronome = true, countIn = true } = {}) {
  const spq = 60 / r.tempo, bar = barQ(r) * spq;
  const start = env.now() + 0.25;
  const t0 = start + (countIn ? bar : 0);
  if (countIn) { let q = 0; r.beats.forEach((L, i) => { env.click(start + q * spq, i === 0); q += L; }); }
  if (metronome) for (const c of clicks(r)) env.click(t0 + c.t, c.accent);
  if (rhythm) for (const t of onsets(r)) env.wood(t0 + t);
  return t0;
}

class TapRhythm extends Exercise {
  get needsMic() { return false; }
  start() { this.next(); }
  next() {
    this.r = generateRhythm({ level: this.level, bars: 2, rng: this.env.rng });
    Object.assign(this, { results: null, state: 'ready', t0: null, taps: [] });
    this.show();
    this.ui.question(`Tap the rhythm (${this.r.num}/${this.r.den}).`);
    this.ui.prompt('Start gives one bar of clicks, then tap each note on the pad. Counting out loud helps.');
    this.ui.buttons([{ id: 'hear', label: '▶ Hear it' }, { id: 'go', label: 'Start', primary: true }, { id: 'new', label: 'New rhythm' }]);
    this.env.pad(false);
  }
  show() {
    this.env.staff.setExercise({ rhythm: this.r, syllables: this.env.syllables(), results: this.results, tol: TOL[this.level],
      playhead: () => this.qNow(), animate: this.state === 'tapping' || this.state === 'hearing' });
  }
  qNow() {
    if (this.t0 == null) return null;
    const t = this.env.now() - this.t0, dur = this.r.bars.length * barQ(this.r) * 60 / this.r.tempo;
    return t < 0 || t > dur ? null : t * this.r.tempo / 60;
  }
  hear() {
    this.state = 'hearing';
    this.t0 = schedule(this.env, this.r);
    this.env.animate(true); this.show();
    const end = (this.t0 - this.env.now() + this.r.bars.length * barQ(this.r) * 60 / this.r.tempo + 0.3) * 1000;
    setTimeout(() => { if (this.state === 'hearing') { this.state = 'ready'; this.env.animate(false); this.show(); } }, end);
  }
  go() {
    this.state = 'tapping'; this.taps = []; this.results = null;
    this.t0 = schedule(this.env, this.r, { rhythm: false });
    this.env.pad(true); this.env.animate(true); this.show();
    this.ui.prompt('Tap each note…');
    this.ui.buttons([]);
    const dur = this.r.bars.length * barQ(this.r) * 60 / this.r.tempo;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.finish(), (this.t0 + dur + 0.6 - this.env.now()) * 1000);
  }
  tap(t) { if (this.state === 'tapping') this.taps.push(t - this.t0 - this.env.tapOffset() / 1000); }
  finish() {
    if (this.state !== 'tapping') return;
    this.state = 'done'; this.env.pad(false); this.env.animate(false);
    const { offsets, extra } = scoreTaps(onsets(this.r), this.taps);
    this.results = offsets;
    const tol = TOL[this.level];
    const hit = offsets.filter((o) => o != null);
    const onTime = hit.filter((o) => Math.abs(o) <= tol).length;
    this.total++; if (onTime === offsets.length && !extra) this.right++;
    this.score();
    const avg = hit.length ? Math.round(mean(hit)) : 0;
    const tend = !hit.length ? '' : Math.abs(avg) < 15 ? ' · nicely centred' : ` · on average ${Math.abs(avg)} ms ${avg > 0 ? 'late' : 'early'}`;
    this.ui.prompt(`${onTime} of ${offsets.length} on time${tend}${extra ? ` · ${extra} extra tap${extra > 1 ? 's' : ''}` : ''}.`);
    this.ui.buttons([{ id: 'hear', label: '▶ Hear it' }, { id: 'go', label: 'Try again' }, { id: 'new', label: 'Next', primary: true }]);
    this.show();
  }
  button(id) {
    if (id === 'hear') this.hear();
    if (id === 'go') this.go();
    if (id === 'new') { clearTimeout(this.timer); this.next(); }
  }
  stop() { super.stop(); clearTimeout(this.timer); this.env.pad(false); this.env.animate(false); }
}

class HearRhythm extends Exercise {
  get needsMic() { return false; }
  start() { this.next(); }
  next() {
    const r = generateRhythm({ level: this.level, bars: 1, rng: this.env.rng });
    const opts = [r];
    for (let i = 0; i < 6 && opts.length < 3; i++) {
      const v = variant(r, this.env.rng, this.level);
      if (v && !opts.some((o) => JSON.stringify(o.bars) === JSON.stringify(v.bars))) opts.push(v);
    }
    this.rows = shuffle(this.env.rng, opts);
    this.answerIdx = this.rows.indexOf(r); this.r = r; this.answered = false;
    this.env.staff.setExercise({ rows: this.rows, syllables: null });
    this.ui.question('Which rhythm do you hear?');
    this.ui.prompt('');
    this.ui.answers(this.rows.map((_, i) => ({ value: i, label: 'ABC'[i] })), this.rows.length);
    this.ui.buttons([{ id: 'hear', label: '▶ Hear again' }, { id: 'next', label: 'Skip' }]);
    this.play();
  }
  play() { schedule(this.env, this.r, { metronome: true }); }
  answer(i) {
    if (this.answered) return;
    this.answered = true;
    const ok = i === this.answerIdx;
    this.total++; if (ok) this.right++;
    this.score();
    this.env.staff.setExercise({ rows: [this.r], syllables: this.env.syllables() });
    this.ui.prompt(ok ? `✓ ${'ABC'[i]}` : `✗ It was ${'ABC'[this.answerIdx]} (shown with its counting).`);
    this.ui.answers(null);
    this.ui.buttons([{ id: 'hear', label: '▶ Hear it' }, { id: 'next', label: 'Next', primary: true }]);
  }
  button(id) { if (id === 'hear') this.play(); if (id === 'next') this.next(); }
}

// Consonants go just before the beat so the vowel lands on it. Sing "ta" on each click; the app finds
// when each vowel starts. First it measures the phone's own delay by listening to piano notes it plays.
const VOWEL = { easy: { tempo: 60, word: 'ta' }, medium: { tempo: 80, word: 'da' }, hard: { tempo: 96, word: 'tra' } };
class VowelOnBeat extends Exercise {
  get hearsItself() { return this.calibrating; }
  start() {
    this.cfg = VOWEL[this.level];
    this.onsetsHeard = []; this.wasVoiced = false;
    this.env.staff.setExercise({ timing: { offsets: [], tol: 40 } });
    this.ui.question(`Sing a short “${this.cfg.word}” on every click — the vowel should land exactly on the click.`);
    if (this.env.micLatency() == null) {
      this.ui.prompt('First, a 5-second check of the phone’s microphone delay: put the phone down and stay quiet.');
      this.ui.buttons([{ id: 'cal', label: 'Measure delay', primary: true }]);
    } else this.ready();
  }
  ready() {
    this.ui.prompt(`Leave a little gap between each “${this.cfg.word}”. Four clicks count you in, then sing on the next eight.`);
    this.ui.buttons([{ id: 'go', label: 'Start', primary: true }, { id: 'cal', label: 'Re-measure delay' }]);
  }
  live(note) {
    const voiced = note != null;
    if (voiced && !this.wasVoiced) this.onsetsHeard.push(this.env.now());
    this.wasVoiced = voiced;
  }
  async calibrate() {
    this.calibrating = true; this.onsetsHeard = [];
    this.ui.buttons([]); this.ui.prompt('Listening to itself…');
    const t0 = this.env.now() + 0.3, times = [];
    for (let i = 0; i < 6; i++) { const t = t0 + i * 0.75; times.push(t); this.env.noteAt(67, t, 0.35); }
    await sleep((t0 - this.env.now() + 6 * 0.75 + 0.5) * 1000);
    this.calibrating = false;
    const lags = times.map((t) => this.onsetsHeard.filter((o) => o > t - 0.05 && o < t + 0.4).map((o) => o - t)[0]).filter((x) => x != null);
    if (lags.length < 4) { this.ui.prompt('Couldn’t hear the notes clearly — turn the volume up and try again.'); this.ui.buttons([{ id: 'cal', label: 'Try again', primary: true }]); return; }
    lags.sort((a, b) => a - b);
    this.env.setMicLatency(Math.round(lags[lags.length >> 1] * 1000));
    this.ready();
  }
  async run() {
    const spb = 60 / this.cfg.tempo, t0 = this.env.now() + 0.3, n = 8;
    for (let i = 0; i < 4 + n; i++) this.env.click(t0 + i * spb, i % 4 === 0);
    this.onsetsHeard = [];
    const beats = Array.from({ length: n }, (_, i) => t0 + (4 + i) * spb);
    this.ui.buttons([]); this.ui.prompt('');
    const view = { offsets: [], tol: 40, beat: null };
    for (let i = 0; i < 4 + n; i++) {
      const wait = (t0 + i * spb - this.env.now()) * 1000;
      if (wait > 0) await sleep(wait);
      if (this.stopped) return;
      view.beat = i < 4 ? `${i + 1}` : '♪';
      this.env.staff.setExercise({ timing: view });
    }
    await sleep(spb * 1000 * 0.9);
    const lat = (this.env.micLatency() || 0) / 1000;
    const offs = beats.map((b) => {
      const cand = this.onsetsHeard.map((o) => o - lat - b).filter((d) => Math.abs(d) < spb * 0.45);
      cand.sort((a, b2) => Math.abs(a) - Math.abs(b2));
      return cand.length ? Math.round(cand[0] * 1000) : null;
    });
    const got = offs.filter((o) => o != null);
    this.env.staff.setExercise({ timing: { offsets: offs, tol: 40 } });
    if (got.length < 4) { this.ui.prompt('I didn’t catch enough notes — sing a bit louder, with a gap between each.'); this.ready(); return; }
    const avg = Math.round(mean(got)), spread = Math.round(Math.sqrt(mean(got.map((o) => (o - avg) ** 2))));
    this.total++; if (Math.abs(avg) <= 40) this.right++;
    this.score();
    const advice = Math.abs(avg) <= 40 ? 'Your vowels land on the beat.'
      : avg > 0 ? `Your vowels land ${avg} ms late — start the consonant a little earlier, so the vowel arrives on the click.`
        : `Your vowels land ${-avg} ms early — let the consonant take a little longer.`;
    this.ui.prompt(`${advice} <span class="muted">(${got.length}/${n} heard · consistency ±${spread} ms)</span>`);
    this.ui.buttons([{ id: 'go', label: 'Again', primary: true }, { id: 'cal', label: 'Re-measure delay' }]);
  }
  button(id) { if (id === 'cal') this.calibrate(); if (id === 'go') this.run(); }
}

// ---------- metronome (with tap calibration) ----------
const SUBS = { none: [], eighths: [0.5], triplets: [1 / 3, 2 / 3], sixteenths: [0.25, 0.5, 0.75], swing: [2 / 3] };
class Metronome extends Exercise {
  get needsMic() { return false; }
  start() {
    this.cfg = this.env.load('metronome', { tempo: 80, ts: '4/4', sub: 'none' });
    this.on = false;
    this.render();
  }
  render() {
    const c = this.cfg;
    this.ui.question(`♩ = ${c.tempo} · ${c.ts}${c.sub !== 'none' ? ' · ' + c.sub : ''}`);
    this.ui.prompt(this.calibratingTaps ? 'Tap the pad along with the clicks…' : '');
    this.ui.answers(['2/4', '3/4', '4/4', '6/8'].map((t) => ({ value: 'ts:' + t, label: t })), 4);
    this.ui.buttons([{ id: '-5', label: '−5' }, { id: '-1', label: '−1' }, { id: 'toggle', label: this.on ? '■ Stop' : '▶ Start', primary: true }, { id: '+1', label: '+1' }, { id: '+5', label: '+5' },
      { id: 'sub', label: `Subdivide: ${c.sub}` }, { id: 'caltap', label: 'Calibrate taps' }]);
    this.env.staff.setExercise({ timing: { offsets: [], tol: 0, beat: this.beatShown || '' } });
  }
  answer(v) { if (v.startsWith('ts:')) { this.cfg.ts = v.slice(3); this.env.save('metronome', this.cfg); this.restart(); } }
  restart() { if (this.on) { this.stopClicks(); this.startClicks(); } this.render(); }
  startClicks() {
    const [num, den] = this.cfg.ts.split('/').map(Number);
    const beats = beatsOf(num, den), spq = 60 / this.cfg.tempo;
    let t = this.env.now() + 0.15, b = 0;
    this.on = true;
    this.clickTimes = [];
    this.iv = setInterval(() => {
      while (t < this.env.now() + 0.15) {
        const L = beats[b % beats.length];
        this.env.click(t, b % beats.length === 0);
        this.clickTimes.push(t);
        for (const f of (L === 1 ? SUBS[this.cfg.sub] : [])) this.env.click(t + f * L * spq, false, true);
        const beatNo = (b % beats.length) + 1, at = t;
        setTimeout(() => { if (this.on) { this.beatShown = beatNo; this.env.staff.setExercise({ timing: { offsets: [], tol: 0, beat: beatNo } }); } }, Math.max(0, (at - this.env.now()) * 1000));
        t += L * spq; b++;
      }
    }, 25);
  }
  stopClicks() { clearInterval(this.iv); this.on = false; }
  tap(t) {
    if (!this.calibratingTaps) return;
    const near = this.clickTimes.reduce((a, c) => (Math.abs(c - t) < Math.abs(a - t) ? c : a), Infinity);
    if (Math.abs(near - t) < 0.25) this.calTaps.push(t - near);
    if (this.calTaps.length >= 12) {
      const s = [...this.calTaps].sort((a, b) => a - b);
      const ms = Math.round(s[s.length >> 1] * 1000);
      this.env.setTapOffset(ms);
      this.calibratingTaps = false; this.env.pad(false);
      this.ui.prompt(`Tap timing calibrated: your taps register ${Math.abs(ms)} ms ${ms > 0 ? 'after' : 'before'} the click; rhythm scores now allow for that.`);
    }
  }
  button(id) {
    const c = this.cfg;
    if (['-5', '-1', '+1', '+5'].includes(id)) { c.tempo = Math.max(30, Math.min(220, c.tempo + Number(id))); this.env.save('metronome', c); this.restart(); }
    if (id === 'toggle') { if (this.on) this.stopClicks(); else this.startClicks(); this.render(); }
    if (id === 'sub') { const keys = Object.keys(SUBS); c.sub = keys[(keys.indexOf(c.sub) + 1) % keys.length]; this.env.save('metronome', c); this.restart(); }
    if (id === 'caltap') {
      if (!this.on) this.startClicks();
      this.calibratingTaps = true; this.calTaps = []; this.env.pad(true); this.render();
    }
  }
  stop() { super.stop(); this.stopClicks(); this.env.pad(false); }
}

// ---------- the counting lesson ----------
const E = (d, x = {}) => ({ d, rest: false, tie: false, trip: false, ...x });
const rh = (num, den, bars, extra = {}) => ({ num, den, beats: beatsOf(num, den), bars, swing: false, tempo: 72, ...extra });
const T3 = 1 / 3;
const CARDS = [
  { text: '<b>The beat</b> is the steady pulse you could tap your foot to. In 4/4 there are four beats in each bar: count <b>1 2 3 4</b>, evenly, out loud.', r: rh(4, 4, [[E(1), E(1), E(1), E(1)]]) },
  { text: '<b>Time signature</b>: the top number is how many beats in a bar, the bottom is which note gets the beat (4 = quarter note). 3/4: <b>1 2 3</b>, with the weight on 1.', r: rh(3, 4, [[E(2), E(1)], [E(1), E(1), E(1)]]) },
  { text: '<b>Dividing the beat.</b> Eighth notes split a beat in two: <b>1 & 2 &</b>. Sixteenths split it in four: <b>1 e & a</b>. Keep counting the smallest division under your breath — that’s the habit that makes rhythm reliable.', r: rh(4, 4, [[E(0.5), E(0.5), E(0.25), E(0.25), E(0.25), E(0.25), E(1), E(0.5), E(0.5)]]) },
  { text: '<b>Dots and ties.</b> A dot adds half the note’s value: a dotted quarter lasts a beat and a half (<b>1 (2) &</b>). A tie joins two notes into one longer sound — sing through it, but keep counting.', r: rh(4, 4, [[E(1.5), E(0.5), E(0.5), E(0.5), E(0.5, { tie: true }), E(0.5)]]) },
  { text: '<b>Rests</b> are counted exactly like notes, just silently. The most common rhythm mistake is coming in early after a rest — count it out.', r: rh(4, 4, [[E(1), E(1, { rest: true }), E(0.5, { rest: true }), E(0.5), E(1)]]) },
  { text: '<b>Compound time (6/8).</b> Two beats per bar, each split in <b>three</b>: <b>1 & a 2 & a</b>. It sways rather than marches.', r: rh(6, 8, [[E(0.5), E(0.5), E(0.5), E(1), E(0.5)], [E(1.5), E(1.5)]]) },
  { text: '<b>Triplets</b> squeeze three notes into the space of two: <b>1 trip let 2</b>. They feel round and even — no note is longer than the others.', r: rh(4, 4, [[E(T3, { trip: true }), E(T3, { trip: true }), E(T3, { trip: true }), E(1), E(T3, { trip: true }), E(T3, { trip: true }), E(T3, { trip: true }), E(1)]]) },
  { text: '<b>Swing.</b> Written as even eighths, but played <b>long–short</b>, like the first and last notes of a triplet. Listen, then count “1 — a 2 — a”.', r: rh(4, 4, [[E(0.5), E(0.5), E(0.5), E(0.5), E(0.5), E(0.5), E(1)]], { swing: true }) },
  { text: '<b>Syncopation</b>: an accent off the beat. Here the long note starts on the “&” of 1 and holds through beat 2. Keep the beat going inside you while the rhythm pushes against it.', r: rh(4, 4, [[E(0.5), E(1), E(0.5), E(1), E(1)]]) },
  { text: '<b>For singers: consonants before the beat.</b> The vowel is the note, so start the consonant just early enough that the vowel arrives on the beat (“T-a” with the T a hair ahead). Try “Vowel on the beat” in this menu to measure it.', r: rh(4, 4, [[E(1), E(1), E(1), E(1)]]) },
];
class CountingLesson extends Exercise {
  get needsMic() { return false; }
  start() { this.i = 0; this.show(); }
  show() {
    const c = CARDS[this.i];
    this.env.staff.setExercise({ rhythm: c.r, syllables: this.env.syllables(), playhead: () => this.qNow(), animate: !!this.t0 });
    this.ui.score(`${this.i + 1}/${CARDS.length}`);
    this.ui.question('');
    this.ui.prompt(c.text);
    const b = [];
    if (this.i > 0) b.push({ id: 'back', label: '‹ Back' });
    b.push({ id: 'play', label: '▶ Play' });
    b.push(this.i < CARDS.length - 1 ? { id: 'next', label: 'Next ›', primary: true } : { id: 'tap', label: 'Try tapping rhythms', primary: true });
    this.ui.buttons(b);
  }
  qNow() {
    if (this.t0 == null) return null;
    const r = CARDS[this.i].r, t = this.env.now() - this.t0, dur = r.bars.length * barQ(r) * 60 / r.tempo;
    if (t > dur) { this.t0 = null; this.env.animate(false); return null; }
    return t < 0 ? null : t * r.tempo / 60;
  }
  button(id) {
    if (id === 'back' && this.i > 0) { this.i--; this.t0 = null; this.show(); }
    if (id === 'next' && this.i < CARDS.length - 1) { this.i++; this.t0 = null; this.show(); }
    if (id === 'play') { this.t0 = schedule(this.env, CARDS[this.i].r); this.env.animate(true); this.show(); }
    if (id === 'tap') this.env.startById('tap');
  }
}

export const RHYTHM = [
  { id: 'counting', title: 'Learn to count', blurb: 'Beats, time signatures, dots, rests, 6/8, triplets, swing, syncopation, consonants.', make: (e, o) => new CountingLesson(e, o) },
  { id: 'tap', title: 'Tap the rhythm', blurb: 'Read a rhythm and tap it in time. See every note early or late.', levels: true,
    why: 'Touch is the most reliable way to check timing (microphone clap detection adds delay). Easy: quarters, halves, eighths in 2/4, 3/4, 4/4. Medium: dotted notes, sixteenths, rests, syncopation, 6/8. Hard: triplets, ties, swing, 5/4 and 7/8. Counting syllables are shown under the notes (choose numbers or Takadimi in Settings).',
    make: (e, o) => new TapRhythm(e, o) },
  { id: 'hearrhythm', title: 'Hear the rhythm', blurb: 'Listen, then pick which of three rhythms you heard.', levels: true,
    why: 'Connects what you hear to what you read. Same levels as Tap the rhythm.', make: (e, o) => new HearRhythm(e, o) },
  { id: 'vowel', title: 'Vowel on the beat', blurb: 'Sing “ta” on each click: does your vowel land on the beat?', levels: true,
    why: 'Singers place the consonant just before the beat so the vowel lands on it. This measures your vowel starts against a metronome (after measuring the phone’s own delay). Easy: “ta” at 60. Medium: “da” at 80. Hard: “tra” at 96.',
    make: (e, o) => new VowelOnBeat(e, o) },
  { id: 'metronome', title: 'Metronome', blurb: 'Tempo, time signature, subdivisions and swing. Calibrate your taps here.', make: (e, o) => new Metronome(e, o) },
];
