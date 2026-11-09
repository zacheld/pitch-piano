// Theory: short lessons (a few cards with staff examples you can play) and quizzes on keys,
// key signatures, finding the key of a piece, and chords. Uses the same exercise framework as
// practice.js (see the env description there).

import { Exercise } from './practice.js';
import { KEYS, NO_KEY, keyById, spell, noteText, scaleOf, signatureLetters, LETTERS } from './notation.js';
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

class Lesson extends Exercise {
  get needsMic() { return false; }
  start() { this.cards = LESSONS[this.opts.lesson](this.env); this.i = 0; this.show(); }
  show() {
    const c = this.cards[this.i], n = this.cards.length;
    this.env.staff.setExercise({ key: c.key === undefined ? null : c.key, items: c.items || [] });
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

class MajorOrMinorQuiz extends Exercise {
  get needsMic() { return false; }
  start() { this.next(); }
  next() {
    const r = this.env.range();
    for (let tries = 0; tries < 50; tries++) {
      const major = pick(this.env.rng, MAJORS.filter((k) => Math.abs(k.fifths) <= 4));
      const minor = relativeMinor(major);
      const isMinor = this.env.rng() < 0.5;
      const key = isMinor ? minor : major;
      const m = generateMelody({ key, level: isMinor ? 4 : 3, length: 7, low: r.low, high: r.high, rng: this.env.rng });
      if (!m || (isMinor && !m.notes.some((n) => n.alter))) continue;
      Object.assign(this, { major, minor, isMinor, key, notes: m.notes.map((n) => n.midi), answered: false });
      this.env.staff.setExercise({ key: major, items: this.notes.map((x) => ({ midi: x, state: 'pending' })) });
      this.ui.prompt('Same key signature, two possible keys. Which is this tune in? <span class="muted">Look at the last note and for a raised 7th.</span>');
      this.ui.answers([{ value: 'major', label: major.name }, { value: 'minor', label: minor.name }], 2);
      this.ui.buttons([{ id: 'hear', label: '▶ Hear it' }, { id: 'next', label: 'Skip' }]);
      return;
    }
    this.ui.prompt('Couldn’t make a tune in your range — widen it in Settings → Practice.');
  }
  answer(v) {
    if (this.answered) return;
    this.answered = true;
    const ok = (v === 'minor') === this.isMinor;
    this.total++; if (ok) this.right++;
    this.score();
    const last = noteText(spell(this.notes[this.notes.length - 1], this.key));
    let why;
    if (this.isMinor) {
      const lt = this.notes.find((m) => ((m - (this.notes[this.notes.length - 1] - 1)) % 12 + 12) % 12 === 0);
      why = `It ends on ${last}${lt != null ? ` and uses ${noteText(spell(lt, this.key))}, the raised 7th of ${this.minor.name}` : ''}: <b>${this.minor.name}</b>.`;
    } else why = `It ends on ${last}, with no raised 7th: <b>${this.major.name}</b>.`;
    this.env.staff.setExercise({ key: this.major, items: this.notes.map((x, i, a) => ({ midi: x, state: i === a.length - 1 ? (ok ? 'good' : 'off') : 'pending' })) });
    this.ui.prompt(`${ok ? '✓' : '✗'} ${why}`);
    this.ui.answers(null);
    this.ui.buttons([{ id: 'hear', label: '▶ Hear it' }, { id: 'next', label: 'Next', primary: true }]);
  }
  button(id) {
    if (id === 'hear') this.env.play(seqOf(this.notes, 0.45));
    if (id === 'next') this.next();
  }
}

class ChordEarQuiz extends Exercise {
  get needsMic() { return false; }
  start() { this.next(); }
  next() {
    const set = this.opts.set === 'all' ? ['major', 'minor', 'dim', 'aug'] : ['major', 'minor'];
    const q = pick(this.env.rng, set);
    const root = 48 + Math.floor(this.env.rng() * 13);
    Object.assign(this, { q, set, notes: QUALITIES[q].semis.map((x) => root + x), answered: false });
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
    const name = noteText(spell(this.notes[0], NO_KEY));
    this.env.staff.setExercise({ key: null, items: [{ notes: this.notes, state: ok ? 'good' : 'off', label: `${name} ${QUALITIES[this.q].label.toLowerCase()}` }] });
    this.ui.prompt(`${ok ? '✓' : `✗ It was ${QUALITIES[this.q].label.toLowerCase()}.`} ${QUALITIES[this.q].label}: ${QUALITIES[this.q].how}.`);
    this.ui.answers(null);
    this.ui.buttons([{ id: 'hear', label: '▶ Hear it' }, { id: 'next', label: 'Next', primary: true }]);
  }
  button(id) { if (id === 'hear') this.play(); if (id === 'next') this.next(); }
}

class RomanQuiz extends Exercise {
  get needsMic() { return false; }
  start() { this.next(); }
  next() {
    const base = this.opts.keyMode === 'random' ? pick(this.env.rng, MAJORS) : (this.env.key().mode === 'major' ? this.env.key() : relativeMajor(this.env.key()));
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
    quizzes: [{ id: 'quiz-majmin', title: 'Major or minor?', blurb: 'A tune and its key signature: is it the major key or its relative minor?', make: (e) => new MajorOrMinorQuiz(e, {}) }] },
  { id: 'chords', title: 'Chords', blurb: 'Triads, major/minor/diminished/augmented, the chords of a key, cadences.',
    lesson: { id: 'lesson-chords', title: 'Chords', make: (e) => new Lesson(e, { lesson: 'chords', quiz: 'quiz-roman' }) },
    quizzes: [
      { id: 'quiz-roman', title: 'Chords of the key', blurb: 'A chord on the staff: which one is it (I, ii, … vii°)?', options: [{ key: 'keyMode', label: 'Key', choices: [['mine', 'My key'], ['random', 'Random']] }], defaults: { keyMode: 'mine' }, make: (e, o) => new RomanQuiz(e, o) },
      { id: 'quiz-chordear', title: 'Chords by ear', blurb: 'Hear a chord: major, minor, diminished or augmented?', options: [{ key: 'set', label: 'Chords', choices: [['mm', 'Major / minor'], ['all', 'All four']] }], defaults: { set: 'mm' }, make: (e, o) => new ChordEarQuiz(e, o) },
    ] },
];
/** Every startable theory item (lessons and quizzes) by id. */
export const THEORY_ITEMS = Object.fromEntries(TOPICS.flatMap((t) => [t.lesson, ...t.quizzes]).map((x) => [x.id, x]));
export { signatureReasoning, relativeMinor };
