// Music notation rules: keys, key signatures, spelling notes in a key, staff positions per clef,
// solfège, intervals. No DOM here, so tests can import it directly.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const ACC_TEXT = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10]; // natural minor; the raised 6th/7th are spelled as chromatic notes

// Chromatic notes (not in the scale) are spelled the way they usually appear in that mode:
// major: ♯1 ♭3 ♯4 ♭6 ♭7   minor: ♭2 ♯3 ♯4 ♯6 ♯7 (raised 6th and leading tone).  [semitones: degree, alteration]
const CHROMATIC = {
  major: { 1: [0, 1], 3: [2, -1], 6: [3, 1], 8: [5, -1], 10: [6, -1] },
  minor: { 1: [1, -1], 4: [2, 1], 6: [3, 1], 9: [5, 1], 11: [6, 1] },
};

const k = (id, name, fifths, mode, l, a = 0) => ({ id, name, fifths, mode, tonic: { l, a } });
/** Keys offered in the key chooser. fifths: number of sharps (+) or flats (−) in the signature. */
export const KEYS = [
  k('C', 'C major', 0, 'major', 0), k('G', 'G major', 1, 'major', 4), k('D', 'D major', 2, 'major', 1),
  k('A', 'A major', 3, 'major', 5), k('E', 'E major', 4, 'major', 2), k('B', 'B major', 5, 'major', 6),
  k('F#', 'F♯ major', 6, 'major', 3, 1), k('Db', 'D♭ major', -5, 'major', 1, -1), k('Ab', 'A♭ major', -4, 'major', 5, -1),
  k('Eb', 'E♭ major', -3, 'major', 2, -1), k('Bb', 'B♭ major', -2, 'major', 6, -1), k('F', 'F major', -1, 'major', 3),
  k('Am', 'A minor', 0, 'minor', 5), k('Em', 'E minor', 1, 'minor', 2), k('Bm', 'B minor', 2, 'minor', 6),
  k('F#m', 'F♯ minor', 3, 'minor', 3, 1), k('C#m', 'C♯ minor', 4, 'minor', 0, 1), k('G#m', 'G♯ minor', 5, 'minor', 4, 1),
  k('Ebm', 'E♭ minor', -6, 'minor', 2, -1), k('Bbm', 'B♭ minor', -5, 'minor', 6, -1), k('Fm', 'F minor', -4, 'minor', 3),
  k('Cm', 'C minor', -3, 'minor', 0), k('Gm', 'G minor', -2, 'minor', 4), k('Dm', 'D minor', -1, 'minor', 1),
];
export const NO_KEY = { id: 'none', name: 'No key', fifths: 0, mode: 'major', tonic: { l: 0, a: 0 }, none: true };
export const keyById = (id) => KEYS.find((x) => x.id === id) || (id === 'none' ? NO_KEY : KEYS[0]);

const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6]; // F C G D A E B
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];  // B E A D G C F
/** Alteration each letter gets from the key signature (array indexed by letter 0..6). */
export function keyAlterations(key) {
  const alt = [0, 0, 0, 0, 0, 0, 0];
  if (key.fifths > 0) for (let i = 0; i < key.fifths; i++) alt[SHARP_ORDER[i]] = 1;
  if (key.fifths < 0) for (let i = 0; i < -key.fifths; i++) alt[FLAT_ORDER[i]] = -1;
  return alt;
}
/** The letters of the signature in drawing order, with their alteration. */
export const signatureLetters = (key) => (key.fifths >= 0 ? SHARP_ORDER.slice(0, key.fifths).map((l) => ({ l, a: 1 }))
  : FLAT_ORDER.slice(0, -key.fifths).map((l) => ({ l, a: -1 })));

const pcOf = (l, a) => (((LETTER_PC[l] + a) % 12) + 12) % 12;
export const tonicPc = (key) => pcOf(key.tonic.l, key.tonic.a);
export const scaleOf = (key) => key.scale || (key.mode === 'minor' ? MINOR : MAJOR);

function make(midi, l) {
  let a = ((midi - LETTER_PC[l]) % 12 + 12) % 12;
  if (a > 6) a -= 12;
  const octave = (midi - LETTER_PC[l] - a) / 12 - 1;
  return { midi, l, a, octave, dia: octave * 7 + l };
}

/**
 * Spell a MIDI note: { midi, l (letter 0–6, C=0), a (−2..2), octave, dia (diatonic number) }.
 * With a key: scale notes take the key's spelling, other notes follow CHROMATIC above.
 * With no key: plain sharps or flats (the user's setting).
 */
export function spell(midi, key, flats = false) {
  const pc = ((midi % 12) + 12) % 12;
  if (!key || key.none) {
    const natural = LETTER_PC.indexOf(pc);
    if (natural >= 0) return make(midi, natural);
    return make(midi, flats ? LETTER_PC.indexOf(pc + 1) : LETTER_PC.indexOf(pc - 1));
  }
  const s = (pc - tonicPc(key) + 12) % 12;
  const scale = scaleOf(key);
  let degree = scale.indexOf(s);
  if (degree < 0 && !CHROMATIC[key.mode]) return spell(midi, KEYS.find((k) => k.mode === 'major' && k.fifths === key.fifths) || KEYS[0], flats); // modes: spell like the parent major
  if (degree < 0) degree = CHROMATIC[key.mode][s][0];
  return make(midi, (key.tonic.l + degree) % 7);
}

export const noteText = (n) => LETTERS[n.l] + ACC_TEXT[n.a];
export const noteName = (n) => noteText(n) + n.octave;

/** Scale degree (1–7) and chromatic alteration of a note relative to the key, e.g. ♯4 = {degree:4, alter:1}. */
export function degreeOf(midi, key) {
  const n = spell(midi, key);
  const degree = ((n.l - key.tonic.l) % 7 + 7) % 7;
  const natural = (tonicPc(key) + scaleOf(key)[degree]) % 12;
  let alter = ((midi % 12) - natural + 12) % 12;
  if (alter > 6) alter -= 12;
  return { degree: degree + 1, alter };
}

// Movable-do solfège (do-based in minor too, so it lines up with the scale numbers).
const SOLFEGE = {
  major: ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'],
  minor: ['do', 're', 'me', 'fa', 'sol', 'le', 'te'],
};
const RAISED = { do: 'di', re: 'ri', fa: 'fi', sol: 'si', la: 'li', me: 'mi', le: 'la', te: 'ti' };
const LOWERED = { re: 'ra', mi: 'me', sol: 'se', la: 'le', ti: 'te', do: 'ti' };
export function solfege(midi, key) {
  const { degree, alter } = degreeOf(midi, key);
  const base = SOLFEGE[key.mode][degree - 1];
  if (!alter) return base;
  return (alter > 0 ? RAISED[base] : LOWERED[base]) || base + (alter > 0 ? '♯' : '♭');
}

// ---------- clefs and staves ----------
// Positions are counted in half staff-spaces from the bottom line: 0 = bottom line, 1 = first space,
// 8 = top line; negative = below the staff (ledger lines at −2, −4 …), 10+ = above.
// bottom: diatonic number of the bottom line at SOUNDING pitch (the tenor treble-8 clef sounds an octave lower).
// glyphAt: position of the line the clef symbol names. sig: where the key signature's accidentals go.
const SIG = {
  treble: { sharp: [8, 5, 9, 6, 3, 7, 4], flat: [4, 7, 3, 6, 2, 5, 1] },
  bass: { sharp: [6, 3, 7, 4, 1, 5, 2], flat: [2, 5, 1, 4, 0, 3, -1] },
  tenor: { sharp: [2, 6, 3, 7, 4, 8, 5], flat: [5, 8, 4, 7, 3, 6, 2] },
  alto: { sharp: [7, 4, 8, 5, 2, 6, 3], flat: [3, 6, 2, 5, 1, 4, 0] },
};
export const STAVES = {
  treble: { glyph: 'gClef', bottom: 4 * 7 + 2, glyphAt: 2, sig: SIG.treble, label: 'Treble' },
  treble8: { glyph: 'gClef8vb', bottom: 3 * 7 + 2, glyphAt: 2, sig: SIG.treble, label: 'Tenor (treble 8)' },
  bass: { glyph: 'fClef', bottom: 2 * 7 + 4, glyphAt: 6, sig: SIG.bass, label: 'Bass' },
  tenorC: { glyph: 'cClef', bottom: 3 * 7 + 1, glyphAt: 6, sig: SIG.tenor, label: 'Tenor C clef' },
  alto: { glyph: 'cClef', bottom: 3 * 7 + 3, glyphAt: 4, sig: SIG.alto, label: 'Alto C clef' },
};
/** Clef choices in Settings. route: which staff each note goes on ('split' = middle C and up on treble). */
export const CLEF_VIEWS = {
  tenor: { staves: ['treble8'], label: 'Tenor (treble with 8 below)' },
  treble: { staves: ['treble'], label: 'Treble' },
  bass: { staves: ['bass'], label: 'Bass' },
  grand: { staves: ['treble', 'bass'], brace: true, route: 'split', label: 'Grand staff (treble + bass)' },
  both: { staves: ['treble8', 'bass'], route: 'both', label: 'Tenor + bass (every note on both)' },
  tenorC: { staves: ['tenorC'], label: 'Tenor C clef (early music)' },
  alto: { staves: ['alto'], label: 'Alto C clef (early music)' },
};

/** Position of a spelled note on a staff. */
export const positionOn = (staffId, n) => n.dia - STAVES[staffId].bottom;
/** Ledger line positions needed for a note at position p. */
export function ledgers(p) {
  const out = [];
  for (let q = -2; q >= p; q -= 2) out.push(q);
  for (let q = 10; q <= p; q += 2) out.push(q);
  return out;
}
/** Which staves (indexes into the view's staves) a note is drawn on. */
export function stavesFor(viewId, midi) {
  const v = CLEF_VIEWS[viewId] || CLEF_VIEWS.tenor;
  if (v.route === 'both') return v.staves.map((_, i) => i);
  if (v.route === 'split') return [midi >= 60 ? 0 : 1];
  return [0];
}
/** The accidental to print before a note, given the key signature: null, or −2..2 (0 = natural). */
export function accidentalShown(n, key) {
  const fromKey = key && !key.none ? keyAlterations(key)[n.l] : 0;
  return n.a === fromKey ? null : n.a;
}
/** A continuous staff position for a fractional MIDI pitch (for the pitch line): naturals on their
 *  lines/spaces, and in-between pitches proportionally between the naturals around them. */
export function continuousPosition(staffId, m) {
  const below = Math.floor(m);
  let lo = below;
  while (LETTER_PC.indexOf(((lo % 12) + 12) % 12) < 0) lo--;
  let hi = lo + 1;
  while (LETTER_PC.indexOf(((hi % 12) + 12) % 12) < 0) hi++;
  const nlo = make(lo, LETTER_PC.indexOf(((lo % 12) + 12) % 12));
  return positionOn(staffId, nlo) + (m - lo) / (hi - lo);
}

// ---------- intervals ----------
export const INTERVALS = [
  { id: 'm2', name: 'minor 2nd', semis: 1, steps: 1 }, { id: 'M2', name: 'major 2nd', semis: 2, steps: 1 },
  { id: 'm3', name: 'minor 3rd', semis: 3, steps: 2 }, { id: 'M3', name: 'major 3rd', semis: 4, steps: 2 },
  { id: 'P4', name: 'perfect 4th', semis: 5, steps: 3 }, { id: 'TT', name: 'tritone (aug. 4th)', semis: 6, steps: 3 },
  { id: 'P5', name: 'perfect 5th', semis: 7, steps: 4 }, { id: 'm6', name: 'minor 6th', semis: 8, steps: 5 },
  { id: 'M6', name: 'major 6th', semis: 9, steps: 5 }, { id: 'm7', name: 'minor 7th', semis: 10, steps: 6 },
  { id: 'M7', name: 'major 7th', semis: 11, steps: 6 }, { id: 'P8', name: 'octave', semis: 12, steps: 7 },
];
/** Spell the note an interval above (dir 1) or below (dir −1) a spelled note, e.g. a major 3rd above E♭ is G. */
export function intervalFrom(n, interval, dir) {
  const midi = n.midi + dir * interval.semis;
  const l = (((n.l + dir * interval.steps) % 7) + 7) % 7;
  return make(midi, l);
}
export const intervalName = (semis) => (INTERVALS.find((i) => i.semis === Math.abs(semis)) || { name: Math.abs(semis) + ' semitones' }).name;
