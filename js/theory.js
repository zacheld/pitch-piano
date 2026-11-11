// Theory: short lessons (a few cards with staff examples you can play) and quizzes on keys,
// key signatures, finding the key of a piece, and chords. Uses the same exercise framework as
// practice.js (see the env description there).

import { Exercise } from './practice.js';
import { KEYS, NO_KEY, keyById, spell, noteText, scaleOf, signatureLetters, LETTERS, tonicPc } from './notation.js';
import { generateMelody, chooseTonic, degreeMidi, makeRng } from './melody.js';

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const shuffle = (rng, arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const MAJORS = KEYS.filter((k) => k.mode === 'major');
const relativeMinor = (major) => KEYS.find((k) => k.mode === 'minor' && k.fifths === major.fifths);
const relativeMajor = (minor) => MAJORS.find((k) => k.fifths === minor.fifths);
const QUALITIES = {
  major: { label: 'Major', semis: [0, 4, 7], how: 'a major 3rd + a minor 3rd (4 + 3 half steps)' },
  minor: { label: 'Minor', semis: [0, 3, 7], how: 'a minor 3rd + a major 3rd (3 + 4 half steps)' },
  dim: { label: 'Diminished', semis: [0, 3, 6], how: 'two minor 3rds (3 + 3 half steps)' },
  aug: { label: 'Augmented', semis: [0, 4, 8], how: 'two major 3rds (4 + 4 half steps)' },
};
const ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const SOL = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'];

/** Where a key's tonic sits for examples: the practice range, so it reads well on the user's clef. */
const tonicFor = (env, key) => { const r = env.range(); const p = chooseTonic(key, r.low, r.high); return p ? p.t : 60; };
const scaleNotes = (t, key, from = 0, to = 7) => { const s = scaleOf(key); const out = []; for (let d = from; d <= to; d++) out.push(degreeMidi(t, s, d)); return out; };
const triadOn = (t, key, d) => { const s = scaleOf(key); return [d, d + 2, d + 4].map((x) => degreeMidi(t, s, x)); };
const seqOf = (notes, dur = 0.42) => notes.map((m, i, a) => ({ notes: [m], dur: i === a.length - 1 ? dur * 2 : dur }));
const chordSeq = (chords, dur = 0.9) => chords.map((c) => ({ notes: c, dur, gap: 0.1 }));

/** Explains how to read a major key from a signature. */
function signatureReasoning(major) {
  const acc = signatureLetters(major);
  if (!acc.length) return 'No sharps or flats: C major.';
  const names = acc.map((a) => LETTERS[a.l] + (a.a > 0 ? '♯' : '♭')).join(' ');
  if (major.fifths > 0) return `${acc.length} sharp${acc.length > 1 ? 's' : ''} (${names}). The last sharp, ${names.split(' ').pop()}, is ti — do is a half step higher: ${major.name}.`;
  if (major.fifths === -1) return 'One flat (B♭) is the one to remember: F major.';
  return `${acc.length} flats (${names}). The second-to-last flat names the key: ${major.name}.`;
}

// ---------- the lessons ----------

const LESSONS = {
  keys: (env) => {
    const C = keyById('C'), G = keyById('G'), D = keyById('D'), A = keyById('A'), Em = keyById('Em'), Fs = keyById('F#');
    const tc = tonicFor(env, C), tg = tonicFor(env, G), te = tonicFor(env, Em);
    const cScale = scaleNotes(tc, C), gScale = scaleNotes(tg, G), eScale = scaleNotes(te, Em);
    const sol = (notes, key) => notes.map((m, i) => ({ midi: m, state: 'pending', label: SOL[i % 7] && (key.mode === 'minor' ? ['do', 're', 'me', 'fa', 'sol', 'le', 'te'][i % 7] : SOL[i % 7]) }));
    return [
      { text: '<b>A key</b> is a family of seven notes that all lean toward one home note, <b>do</b>. A major scale always uses the same pattern of steps: whole, whole, <b>half</b>, whole, whole, whole, <b>half</b>.',
        key: C, items: sol(cScale, C), play: seqOf(cScale) },
      { text: 'Start the same pattern on <b>G</b> and one note must change: the 7th becomes <b>F♯</b>, so there is still a half step just below the top do.',
        key: NO_KEY, items: gScale.map((m, i) => ({ midi: m, state: i === 6 ? 'current' : 'pending', label: SOL[i % 7] })), play: seqOf(gScale) },
      { text: 'Rather than writing ♯ before every F, music puts it once at the start of each line: the <b>key signature</b>. One sharp means every F is F♯ — the key of <b>G major</b>.',
        key: G, items: sol(gScale, G), play: seqOf(gScale) },
      { text: 'Keys a 5th apart differ by one sharp or flat. Count up in 5ths from C and you add sharps: G 1, D 2, A 3, E 4, B 5, F♯ 6. Count down in 5ths and you add flats: F 1, B♭ 2, E♭ 3, A♭ 4, D♭ 5. This is the <b>circle of fifths</b>. Here is D major: two sharps.',
        key: D, items: [{ midi: tonicFor(env, D), state: 'pending', label: 'do' }], play: seqOf(scaleNotes(tonicFor(env, D), D)) },
      { text: 'Sharps always appear in the same order — <b>F C G D A E B</b> — and flats in the reverse order — <b>B E A D G C F</b>. (Six sharps shown: F♯ major.)',
        key: Fs, items: [] },
      { text: '<b>Reading a major key from its signature.</b> With sharps, the last sharp is <b>ti</b>, so do is a half step higher (here G♯ → A major). With flats, the second-to-last flat names the key (B♭ E♭ A♭ → E♭ major); one flat is F major. None: C major.',
        key: A, items: [{ midi: tonicFor(env, A), state: 'good', label: 'do = A' }] },
      { text: 'Every signature fits two keys: a major key and its <b>relative minor</b>, which starts on la (three half steps lower). G major and E minor share one sharp but sound different, because home is a different note. Here is E minor.',
        key: Em, items: sol(eScale, Em), play: seqOf(eScale) },
    ];
  },
  findKey: (env) => {
    const Bb = keyById('Bb'), Gm = keyById('Gm');
    const r = env.range();
    const major = generateMelody({ key: Bb, level: 2, length: 7, low: r.low, high: r.high, rng: makeRng(11) });
    let minor = null;
    for (let s = 1; s < 200 && !minor; s++) {
      const m = generateMelody({ key: Gm, level: 4, length: 7, low: r.low, high: r.high, rng: makeRng(s) });
      if (m && m.notes.some((n) => n.alter)) minor = m;
    }
    const tb = tonicFor(env, Bb), s = scaleOf(Bb);
    const V = [4, 6, 8].map((d) => degreeMidi(tb, s, d)), I = [0, 2, 4].map((d) => degreeMidi(tb, s, d));
    const items = (m, key) => (m ? m.notes.map((n, i, a) => ({ midi: n.midi, state: i === a.length - 1 ? 'good' : n.alter ? 'current' : 'pending' })) : []);
    return [
      { text: 'Step 1 — <b>the key signature</b> narrows it to two keys: a major key and its relative minor. Two flats: <b>B♭ major</b> or <b>G minor</b>.', key: Bb, items: [] },
      { text: 'Step 2 — <b>the ending</b>. Melodies almost always end on the home note (and often begin on a note of the home chord). This one ends on B♭, with no raised 7th: <b>B♭ major</b>.',
        key: Bb, items: items(major, Bb), play: major ? seqOf(major.notes.map((n) => n.midi), 0.45) : null },
      { text: 'Step 3 — <b>the raised 7th</b>. Minor-key music usually raises the 7th note so it leans up into the home note. With two flats, an <b>F♯</b> (highlighted) is the giveaway, and the tune ends on G: <b>G minor</b>.',
        key: Gm, items: items(minor, Gm), play: minor ? seqOf(minor.notes.map((n) => n.midi), 0.45) : null },
      { text: 'Step 4 — <b>check the chords</b>. With an accompaniment, the last chord is the home chord, usually right after V (the dominant): here V → I in B♭ major.',
        key: Bb, items: [{ notes: V, state: 'pending', label: 'V' }, { notes: I, state: 'good', label: 'I' }], play: chordSeq([V, I]) },
      { text: 'Step 5 — <b>when the music moves</b>. An accidental that keeps coming back usually means a new key. In B♭ major: an <b>E♮</b> (the raised 4th, “fi”) means it has moved up to the dominant, F major; an <b>A♭</b> (the lowered 7th, “te”) points to the subdominant, E♭ major; an <b>F♯</b> (the raised 5th) is the leading note of the relative minor, G minor. The quiz’s hard level asks where a tune ends up.',
        key: Bb, items: [] },
    ];
  },
  chords: (env) => {
    const key = env.key().mode === 'major' ? env.key() : relativeMajor(env.key());
    const t = tonicFor(env, key);
    const root = t;
    const ch = (q) => QUALITIES[q].semis.map((x) => root + x);
    const name = noteText(spell(root, key));
    const triads = ROMAN.map((_, d) => triadOn(t, key, d));
    const arp = (c) => [...c.map((m) => ({ notes: [m], dur: 0.32 })), { notes: c, dur: 1.0, gap: 0.15 }];
    return [
      { text: `A <b>triad</b> stacks every other note of the scale: a root, a 3rd above it and a 5th above the root. This is the ${name} major triad.`,
        key, items: [{ notes: ch('major'), state: 'pending', label: name }], play: arp(ch('major')) },
      { text: `The 3rds decide the quality. <b>Major</b> = ${QUALITIES.major.how}: bright. <b>Minor</b> = ${QUALITIES.minor.how}: darker.`,
        key: NO_KEY, items: [{ notes: ch('major'), state: 'pending', label: 'major' }, { notes: ch('minor'), state: 'pending', label: 'minor' }], play: [...arp(ch('major')), ...arp(ch('minor'))] },
      { text: `<b>Diminished</b> = ${QUALITIES.dim.how}: tense. <b>Augmented</b> = ${QUALITIES.aug.how}: unsettled, and rarer.`,
        key: NO_KEY, items: [{ notes: ch('dim'), state: 'pending', label: 'dim.' }, { notes: ch('aug'), state: 'pending', label: 'aug.' }], play: [...arp(ch('dim')), ...arp(ch('aug'))] },
      { text: `<b>The chords of a key.</b> Build a triad on every note of the major scale and you get I ii iii IV V vi vii°: capitals are major, lower case minor, ° diminished. The pattern is the same in every major key (here ${key.name}).`,
        key, items: triads.map((c, d) => ({ notes: c, state: 'pending', label: ROMAN[d] })), play: chordSeq(triads, 0.6) },
      { text: '<b>I, IV and V</b> do most of the work. V wants to go home to I: V → I is the strongest ending (an <b>authentic cadence</b>). IV → I is the gentler <b>plagal</b> cadence — the “A-men” at the end of a hymn.',
        key, items: [{ notes: triads[4], state: 'pending', label: 'V' }, { notes: triads[0], state: 'good', label: 'I' }, { notes: triads[3], state: 'pending', label: 'IV' }, { notes: triads[0], state: 'good', label: 'I' }],
        play: [...chordSeq([triads[4], triads[0]]), { notes: [], dur: 0.4 }, ...chordSeq([triads[3], triads[0]])] },
      { text: '<b>Why singers care.</b> In a choir your note is one part of a chord. A pure (beatless) major 3rd is about <b>14 cents narrower</b> than the piano’s, so singers tuning by ear place the 3rd of a major chord slightly low. Early-music practice goes further: in just or meantone tuning, sharped notes sit low and flatted notes high. (Many modern choirs instead lean the leading tone up toward do.)',
        key, items: [{ notes: triads[0], state: 'pending', label: 'the 3rd: tune it a touch low' }], play: arp(triads[0]) },
    ];
  },
};

export class Lesson extends Exercise {
  get needsMic() { return false; }
  start() { this.cards = (this.opts.cards || LESSONS[this.opts.lesson])(this.env); this.i = 0; this.show(); }
  show() {
    const c = this.cards[this.i], n = this.cards.length;
    this.env.staff.setExercise({ key: c.key === undefined ? null : c.key, items: c.items || [], view: c.view });
    this.ui.score(`${this.i + 1}/${n}`);
    this.ui.prompt(c.text);
    const b = [];
    if (this.i > 0) b.push({ id: 'back', label: '‹ Back' });
    if (c.play) b.push({ id: 'play', label: '▶ Play' });
    if (this.i < n - 1) b.push({ id: 'next', label: 'Next ›', primary: true });
    else if (this.opts.quiz) b.push({ id: 'quiz', label: 'Take the quiz', primary: true });
    this.ui.buttons(b);
    this.ui.answers(null);
  }
  button(id) {
    const c = this.cards[this.i];
    if (id === 'back' && this.i > 0) { this.i--; this.show(); }
    if (id === 'next' && this.i < this.cards.length - 1) { this.i++; this.show(); }
    if (id === 'play' && c.play) this.env.play(c.play);
    if (id === 'quiz' && this.opts.quiz) this.env.startById(this.opts.quiz);
  }
}

// ---------- quizzes ----------

class KeySignatureQuiz extends Exercise {
  get needsMic() { return false; }
  start() { this.next(); }
  next() {
    const pool = MAJORS.filter((k) => k !== this.last);
    const major = pick(this.env.rng, pool);
    this.last = major; this.answered = false;
    this.major = major;
    const distractors = shuffle(this.env.rng, MAJORS.filter((k) => k !== major && (Math.abs(k.fifths - major.fifths) <= 2 || k.fifths === -major.fifths))).slice(0, 3);
    this.options = shuffle(this.env.rng, [major, ...distractors]);
    this.env.staff.setExercise({ key: major, items: [] });
    this.ui.prompt('Which <b>major</b> key has this key signature?');
    this.ui.answers(this.options.map((k) => ({ value: k.id, label: k.name.replace(' major', '') })), 4);
    this.ui.buttons([{ id: 'next', label: 'Skip' }]);
  }
  answer(id) {
    if (this.answered) return;
    this.answered = true;
    const ok = id === this.major.id;
    this.total++; if (ok) this.right++;
    this.score();
    const t = tonicFor(this.env, this.major);
    this.env.staff.setExercise({ key: this.major, items: [{ midi: t, state: ok ? 'good' : 'off', label: `do = ${noteText(spell(t, this.major))}` }] });
    const rel = relativeMinor(this.major);
    this.ui.prompt(`${ok ? '✓' : `✗ It’s ${this.major.name}.`} ${signatureReasoning(this.major)} Its relative minor is ${rel.name}.`);
    this.ui.answers(null);
    this.ui.buttons([{ id: 'next', label: 'Next', primary: true }]);
    this.env.play([{ notes: [t], dur: 0.3 }, { notes: [t + 4], dur: 0.3 }, { notes: [t + 7], dur: 0.3 }, { notes: [t, t + 4, t + 7], dur: 1.0 }]);
  }
  button(id) { if (id === 'next') this.next(); }
}

// ---------- Find the key ----------
// (Replaces "Major or minor?", whose tunes all ended on the home note, so the last note gave the answer away.)
// The tunes here never end on their home note: you have to read the evidence.
//  Easy: the key signature is shown; is it the major key or its relative minor? (find the raised 7th)
//  Medium: no key signature: the accidentals are written in. Work out the signature, then major or minor,
//          from four neighbouring keys.
//  Hard: two phrases under the home key's signature. Does the second stay at home or move to the dominant,
//        the subdominant or the relative minor? (spot the accidental that keeps coming back)
const pcOf = (m) => ((m % 12) + 12) % 12;
const relativeOf = (key) => (key.mode === 'major' ? relativeMinor(key) : relativeMajor(key));
const sameModeShift = (key, df) => KEYS.find((k) => k.mode === key.mode && k.fifths === key.fifths + df);
/** A phrase in `key` that stops somewhere other than its home note (a generated tune, cut before it gets
 *  home) and contains every pitch class in `need` (the evidence the question relies on). */
function phraseIn(env, key, { level, length, need = [] }) {
  const { low, high } = env.range();
  for (let tries = 0; tries < 120; tries++) {
    const m = generateMelody({ key, level, length: length + 3, low, high, rng: env.rng });
    if (!m) return null;
    for (const cut of [1, 2, 3]) {
      const notes = m.notes.slice(0, m.notes.length - cut).map((n) => n.midi);
      if (pcOf(notes[notes.length - 1]) === pcOf(m.tonic)) continue;
      const pcs = new Set(notes.map(pcOf));
      if (need.every((pc) => pcs.has(pcOf(pc)))) return notes;
    }
  }
  return null;
}
/** A note's name in `key`, with ♮ where the home signature would otherwise sharpen or flatten it (E♮ in B♭). */
const nameIn = (midi, key, sig = key) => {
  const n = spell(midi, key);
  return noteText(n) + (n.a === 0 && sig && !sig.none && signatureLetters(sig).some((x) => x.l === n.l) ? '♮' : '');
};

class FindKeyQuiz extends Exercise {
  get needsMic() { return false; }
  start() { this.next(); }
  next() {
    for (let tries = 0; tries < 30; tries++) if (this.make()) return this.show(false);
    this.ui.prompt('Couldn’t make a tune in your range — widen it in Settings → Practice.');
  }
  make() {
    const rng = this.env.rng, lv = this.level;
    const major = pick(rng, MAJORS.filter((k) => Math.abs(k.fifths) <= (lv === 'easy' ? 4 : 5) && k !== this.lastMajor));
    const Mpc = tonicPc(major);
    if (lv === 'hard') {
      const moves = [
        { id: 'stay', key: major, cue: null, need: [Mpc + 5, Mpc + 11] },
        { id: 'dom', key: sameModeShift(major, 1), cue: Mpc + 6, need: [Mpc + 6] },
        { id: 'sub', key: sameModeShift(major, -1), cue: Mpc + 10, need: [Mpc + 10] },
        { id: 'rel', key: relativeMinor(major), cue: Mpc + 8, need: [Mpc + 8] },
      ].filter((x) => x.key);
      if (moves.length < 4) return false;
      const move = pick(rng, moves);
      const a = phraseIn(this.env, major, { level: 3, length: 4 });
      const b = phraseIn(this.env, move.key, { level: move.id === 'rel' ? 4 : 3, length: 5, need: move.need });
      if (!a || !b) return false;
      Object.assign(this, { kind: 'hard', home: major, move, moves, correct: move.id, phrases: [a, b], sig: major, answered: false, lastMajor: major });
      this.options = moves.map((x) => ({ value: x.id, label: x.id === 'stay' ? `Stays in ${major.name}` : `Moves to ${x.key.name}` }));
      return true;
    }
    const minor = relativeMinor(major);
    const key = rng() < 0.5 ? minor : major;
    // evidence: minor tunes show their raised 7th; with no signature, also the notes that fix the signature
    // (fa and ti of the major scale: the ones that differ from the neighbouring keys)
    const need = [];
    if (key === minor) need.push(Mpc + 8);
    if (lv === 'medium') need.push(Mpc + 5, Mpc + 11);
    const notes = phraseIn(this.env, key, { level: key === minor ? 4 : 3, length: lv === 'easy' ? 7 : 8, need });
    if (!notes) return false;
    const opts = lv === 'easy' ? [major, minor] : shuffle(rng, [key, relativeOf(key), sameModeShift(key, 1), sameModeShift(key, -1)].filter(Boolean));
    Object.assign(this, { kind: lv, key, major, minor, correct: key.id, phrases: [notes], sig: lv === 'easy' ? major : NO_KEY, answered: false, lastMajor: major });
    this.options = opts.map((k) => ({ value: k.id, label: k.name }));
    return true;
  }
  /** Staff items: the phrase(s), with a gap between two; after answering, the evidence is highlighted. */
  items(reveal) {
    const out = [];
    this.phrases.forEach((p, i) => {
      const spellKey = this.kind === 'hard' ? (i === 0 ? this.home : this.move.key) : this.key;
      if (i > 0) out.push({ bar: true });
      for (const m of p) {
        const cue = reveal && this.isCue(m, i);
        out.push({ midi: m, spell: spellKey, state: cue ? 'current' : 'pending', label: cue ? nameIn(m, spellKey, this.sig) : null });
      }
    });
    return out;
  }
  /** The evidence: the new accidental (hard), the raised 7th (minor), and with no signature every sharp or flat. */
  isCue(m, phrase) {
    if (this.kind === 'hard') return phrase === 1 && this.move.cue != null && pcOf(m) === pcOf(this.move.cue);
    if (this.key === this.minor && pcOf(m) === pcOf(tonicPc(this.major) + 8)) return true;
    return this.kind === 'medium' && spell(m, this.key).a !== 0;
  }
  show(reveal) {
    this.env.staff.setExercise({ key: this.kind === 'hard' ? this.home : this.key, sig: this.sig, carry: true, items: this.items(reveal) });
    if (reveal) return;
    const q = this.kind === 'hard' ? `It starts in ${this.home.name}. Where is it by the end of the second phrase?`
      : this.kind === 'medium' ? 'No key signature — the accidentals are written in. Which key is it in?'
        : 'Is this tune in the major key or its relative minor?';
    this.ui.question(q);
    this.ui.prompt('<span class="muted">It doesn’t end on its home note, so read the evidence.</span>');
    this.ui.answers(this.options, 2);
    this.ui.buttons([{ id: 'hear', label: '▶ Hear it' }, { id: 'next', label: 'Skip' }]);
  }
  answer(v) {
    if (this.answered) return;
    this.answered = true;
    const ok = v === this.correct;
    this.total++; if (ok) this.right++;
    this.score();
    this.show(true);
    this.ui.prompt(`${ok ? '✓' : '✗'} ${this.why()}`);
    this.ui.answers(null);
    this.ui.buttons([{ id: 'hear', label: '▶ Hear it' }, { id: 'next', label: 'Next', primary: true }]);
  }
  why() {
    if (this.kind === 'hard') {
      const h = this.home, k = this.move.key, cue = this.move.cue != null ? nameIn(this.phrases[1].find((m) => pcOf(m) === pcOf(this.move.cue)), k, h) : null;
      if (this.move.id === 'stay') return `No new accidentals in the second phrase — fa and ti are still as in ${h.name}: it <b>stays in ${h.name}</b>.`;
      if (this.move.id === 'dom') return `The second phrase brings in ${cue}: the raised 4th of ${h.name} (fi), the leading note of its dominant. It has moved to <b>${k.name}</b>.`;
      if (this.move.id === 'sub') return `The second phrase brings in ${cue}: the lowered 7th of ${h.name} (te), which belongs to its subdominant. It has moved to <b>${k.name}</b>.`;
      return `The second phrase brings in ${cue}: the raised 5th of ${h.name}, the leading note of its relative minor. It has moved to <b>${k.name}</b>.`;
    }
    const n = Math.abs(this.major.fifths), acc = this.major.fifths > 0 ? 'sharp' : 'flat';
    const sig = this.major.fifths === 0 ? 'no sharps or flats' : `${n} ${acc}${n > 1 ? 's' : ''}`;
    const sevenPc = pcOf(tonicPc(this.major) + 8);
    const seven = nameIn(this.phrases[0].find((m) => pcOf(m) === sevenPc) ?? (60 + sevenPc), this.minor, this.major);
    const mode = this.key === this.minor
      ? `${seven} is the raised 7th of ${this.minor.name}, leaning up into its home note: <b>${this.minor.name}</b>.`
      : `There’s no ${seven} (the raised 7th ${this.minor.name} would need): <b>${this.major.name}</b>.`;
    if (this.kind === 'easy') return `The signature (${sig}) means ${this.major.name} or ${this.minor.name}. ${mode}`;
    const letters = signatureLetters(this.major).map((x) => LETTERS[x.l] + (x.a > 0 ? '♯' : '♭'));
    const which = letters.length ? `The ${this.major.fifths > 0 ? 'sharp' : 'flat'}${letters.length > 1 ? 's' : ''} (${letters.join(' ')}) give${letters.length > 1 ? '' : 's'} a signature of ${sig}` : 'No sharps or flats in the key';
    return `${which}: ${this.major.name} or ${this.minor.name}. ${mode}`;
  }
  button(id) {
    if (id === 'hear') this.env.play(this.phrases.flatMap((p) => { const q = seqOf(p, 0.42); q[q.length - 1].gap = 0.45; return q; }));
    if (id === 'next') this.next();
  }
}

class ChordEarQuiz extends Exercise {
  get needsMic() { return false; }
  start() { this.next(); }
  next() {
    const lvl = this.opts.level || 'easy';
    const set = lvl === 'easy' ? ['major', 'minor'] : lvl === 'medium' ? ['major', 'minor', 'dim'] : ['major', 'minor', 'dim', 'aug'];
    const q = pick(this.env.rng, set);
    const root = 48 + Math.floor(this.env.rng() * 13);
    let notes = QUALITIES[q].semis.map((x) => root + x);
    // hard: inversions too (the lowest note moved up an octave, once or twice)
    if (lvl === 'hard') { const inv = Math.floor(this.env.rng() * 3); for (let i = 0; i < inv; i++) notes = [...notes.slice(1), notes[0] + 12]; }
    Object.assign(this, { q, set, notes, answered: false });
    this.env.staff.setExercise({ key: null, items: [{ midi: null, state: 'hidden' }] });
    this.ui.prompt('Listen. What kind of chord is it?');
    this.ui.answers(set.map((x) => ({ value: x, label: QUALITIES[x].label })), set.length);
    this.ui.buttons([{ id: 'hear', label: '▶ Hear again' }, { id: 'next', label: 'Skip' }]);
    this.play();
  }
  play() { const n = this.notes; return this.env.play([{ notes: n, dur: 1.1, gap: 0.2 }, ...n.map((m) => ({ notes: [m], dur: 0.32 })), { notes: n, dur: 1.0 }]); }
  answer(v) {
    if (this.answered) return;
    this.answered = true;
    const ok = v === this.q;
    this.total++; if (ok) this.right++;
    this.score();
    const name = noteText(spell(this.root(), NO_KEY));
    this.env.staff.setExercise({ key: null, items: [{ notes: this.notes, state: ok ? 'good' : 'off', label: `${name} ${QUALITIES[this.q].label.toLowerCase()}` }] });
    this.ui.prompt(`${ok ? '✓' : `✗ It was ${QUALITIES[this.q].label.toLowerCase()}.`} ${QUALITIES[this.q].label}: ${QUALITIES[this.q].how}.`);
    this.ui.answers(null);
    this.ui.buttons([{ id: 'hear', label: '▶ Hear it' }, { id: 'next', label: 'Next', primary: true }]);
  }
  /** The chord's root, even when inverted. */
  root() { const semis = QUALITIES[this.q].semis; return this.notes.find((m) => semis.every((x) => this.notes.some((n) => ((n - m - x) % 12 + 12) % 12 === 0))); }
  button(id) { if (id === 'hear') this.play(); if (id === 'next') this.next(); }
}

class RomanQuiz extends Exercise {
  get needsMic() { return false; }
  start() { this.next(); }
  next() {
    const k = this.env.key();
    const base = k.mode === 'major' ? k : relativeMajor(k);
    const t = tonicFor(this.env, base);
    let d = Math.floor(this.env.rng() * 7);
    if (d === this.lastD) d = (d + 1 + Math.floor(this.env.rng() * 6)) % 7;
    Object.assign(this, { key: base, t, d, lastD: d, notes: triadOn(t, base, d), answered: false });
    this.env.staff.setExercise({ key: base, items: [{ notes: this.notes, state: 'pending' }] });
    this.ui.prompt(`In <b>${base.name}</b>, which chord is this?`);
    this.ui.answers(ROMAN.map((r, i) => ({ value: i, label: r })), 7);
    this.ui.buttons([{ id: 'hear', label: '▶ Hear it' }, { id: 'next', label: 'Skip' }]);
  }
  answer(v) {
    if (this.answered) return;
    this.answered = true;
    const ok = v === this.d;
    this.total++; if (ok) this.right++;
    this.score();
    const names = this.notes.map((m) => noteText(spell(m, this.key)));
    const quality = [0, 3, 4].includes(this.d) ? 'major' : this.d === 6 ? 'diminished' : 'minor';
    this.env.staff.setExercise({ key: this.key, items: [{ notes: this.notes, state: ok ? 'good' : 'off', label: ROMAN[this.d] }] });
    this.ui.prompt(`${ok ? '✓' : `✗ It’s ${ROMAN[this.d]}.`} ${ROMAN[this.d]} is ${names[0]} ${quality} (${names.join(' ')}), built on ${SOL[this.d]}.`);
    this.ui.answers(null);
    this.ui.buttons([{ id: 'hear', label: '▶ Hear it' }, { id: 'next', label: 'Next', primary: true }]);
    this.env.play([{ notes: this.notes, dur: 1.1 }]);
  }
  button(id) { if (id === 'hear') this.env.play([{ notes: this.notes, dur: 1.1 }]); if (id === 'next') this.next(); }
}

// ---------- catalogue: one row per topic; each has a lesson and quizzes ----------
export const TOPICS = [
  { id: 'keys', title: 'Keys & key signatures', blurb: 'What a key is, the circle of fifths, and reading a key from its signature.',
    lesson: { id: 'lesson-keys', title: 'Keys & key signatures', make: (e) => new Lesson(e, { lesson: 'keys', quiz: 'quiz-keysig' }) },
    quizzes: [{ id: 'quiz-keysig', title: 'Name the key', blurb: 'See a key signature, pick the major key.', make: (e) => new KeySignatureQuiz(e, {}) }] },
  { id: 'findkey', title: 'Finding the key', blurb: 'How to tell which key a piece is in: signature, ending, raised 7th.',
    lesson: { id: 'lesson-findkey', title: 'Finding the key', make: (e) => new Lesson(e, { lesson: 'findKey', quiz: 'quiz-majmin' }) },
    quizzes: [{ id: 'quiz-majmin', title: 'Find the key', blurb: 'A tune that doesn’t end on its home note: which key is it in? Hard: where does it move to?', levels: true,
      why: 'Easy: the key signature is shown; tell the major key from its relative minor by the raised 7th. Medium: no key signature, so work out the signature from the accidentals first (four neighbouring keys to choose from). Hard: does the second phrase stay at home or move to the dominant, the subdominant or the relative minor? None of the tunes end on their home note, so you have to read the evidence.',
      make: (e, o) => new FindKeyQuiz(e, o) }] },
  { id: 'chords', title: 'Chords', blurb: 'Triads, major/minor/diminished/augmented, the chords of a key, cadences.',
    lesson: { id: 'lesson-chords', title: 'Chords', make: (e) => new Lesson(e, { lesson: 'chords', quiz: 'quiz-roman' }) },
    quizzes: [
      { id: 'quiz-roman', title: 'Chords of the key', blurb: 'A chord on the staff: which one is it (I, ii, … vii°)?', make: (e, o) => new RomanQuiz(e, o) },
      { id: 'quiz-chordear', title: 'Chords by ear', blurb: 'Hear a chord: major or minor (easy), plus diminished (medium), plus augmented and inversions (hard).', levels: true, make: (e, o) => new ChordEarQuiz(e, o) },
    ] },
];
/** Every startable theory item (lessons and quizzes) by id. */
export const THEORY_ITEMS = Object.fromEntries(TOPICS.flatMap((t) => [t.lesson, ...t.quizzes]).map((x) => [x.id, x]));
export { signatureReasoning, relativeMinor };
