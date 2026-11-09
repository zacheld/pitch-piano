// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, keyById, NO_KEY, spell, noteName, keyAlterations, positionOn, ledgers, stavesFor, accidentalShown,
  continuousPosition, solfege, degreeOf, intervalFrom, INTERVALS, STAVES, signatureLetters } from '../js/notation.js';
import { generateMelody, makeRng, chooseTonic, LEVELS } from '../js/melody.js';

const name = (midi, keyId, flats) => noteName(spell(midi, keyById(keyId), flats));

test('spelling: no key uses plain sharps or flats', () => {
  assert.equal(noteName(spell(61, NO_KEY, false)), 'C♯4');
  assert.equal(noteName(spell(61, NO_KEY, true)), 'D♭4');
  assert.equal(noteName(spell(60, NO_KEY)), 'C4');
});

test('spelling: notes in the key use the key signature', () => {
  assert.equal(name(66, 'D'), 'F♯4');     // D major
  assert.equal(name(61, 'D'), 'C♯4');
  assert.equal(name(70, 'F'), 'B♭4');     // F major
  assert.equal(name(63, 'Eb'), 'E♭4');
  assert.equal(name(68, 'Ab'), 'A♭4');
  assert.equal(name(65, 'F#'), 'E♯4');     // F♯ major has E♯ (sounds as F4)
  assert.equal(name(59, 'Db'), 'C♭4');    // the flattened 7th of D♭ major is C♭
});

test('spelling: chromatic notes follow common practice for the mode', () => {
  // C major: ♯1 ♭3 ♯4 ♭6 ♭7
  assert.deepEqual([61, 63, 66, 68, 70].map((m) => name(m, 'C')), ['C♯4', 'E♭4', 'F♯4', 'A♭4', 'B♭4']);
  // A minor: ♭2 ♯3 ♯4 ♯6 ♯7 (the leading tone is G♯)
  assert.deepEqual([70, 61, 63, 66, 68].map((m) => name(m, 'Am')), ['B♭4', 'C♯4', 'D♯4', 'F♯4', 'G♯4']);
  // F minor: the leading tone is E natural
  assert.equal(name(64, 'Fm'), 'E4');
});

test('spelling across octave boundaries: B♯ and C♭ get the right octave', () => {
  assert.equal(name(60, 'C#m'), 'B♯3'); // leading tone of C♯ minor
  assert.equal(name(59, 'Ebm'), 'C♭4');   // C♭ is in E♭ minor's signature; it sounds as B3
});

test('every key: the 7 scale notes are 7 different letters and match the signature', () => {
  for (const key of KEYS) {
    const alt = keyAlterations(key);
    const base = 60 + ((((key.tonic.l === 0 ? 0 : [0, 2, 4, 5, 7, 9, 11][key.tonic.l]) + key.tonic.a) % 12) + 12) % 12;
    const scale = key.mode === 'minor' ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const notes = scale.map((s) => spell(base + s, key));
    assert.equal(new Set(notes.map((n) => n.l)).size, 7, key.name);
    for (const n of notes) assert.equal(n.a, alt[n.l], `${key.name}: ${noteName(n)} should match the signature`);
    assert.equal(signatureLetters(key).length, Math.abs(key.fifths));
  }
});

test('staff positions: middle C, ledger lines, tenor treble-8 sounds an octave down', () => {
  const C4 = spell(60, NO_KEY), C3 = spell(48, NO_KEY), C5 = spell(72, NO_KEY), G4 = spell(67, NO_KEY);
  assert.equal(positionOn('treble', C4), -2);       // one ledger line below treble
  assert.equal(positionOn('bass', C4), 10);         // one ledger line above bass
  assert.equal(positionOn('treble', G4), 2);        // G clef curls round the G line
  assert.equal(positionOn('treble8', C3), -2);      // tenor low C looks like treble middle C
  assert.equal(positionOn('treble8', C5), 12);      // tenor high C: two ledger lines above
  assert.equal(positionOn('tenorC', C4), 6);        // C clef on the 4th line marks middle C
  assert.equal(positionOn('bass', spell(53, NO_KEY)), 6); // F3 on the F line
  assert.deepEqual(ledgers(-2), [-2]);
  assert.deepEqual(ledgers(-5), [-2, -4]);
  assert.deepEqual(ledgers(12), [10, 12]);
  assert.deepEqual(ledgers(4), []);
  assert.equal(STAVES.treble8.glyph, 'gClef8vb');
});

test('clef views: grand staff splits at middle C; "both" (tenor + bass) shows every note on both staves', () => {
  assert.deepEqual(stavesFor('grand', 60), [0]);
  assert.deepEqual(stavesFor('grand', 59), [1]);
  assert.deepEqual(stavesFor('both', 50), [0, 1]);
  assert.deepEqual(stavesFor('tenor', 50), [0]);
});

test('accidentals shown against the key signature', () => {
  const D = keyById('D');
  assert.equal(accidentalShown(spell(66, D), D), null);   // F♯ is in the signature
  assert.equal(accidentalShown(spell(65, D), D), 0);      // F natural needs a natural sign
  assert.equal(accidentalShown(spell(70, D), D), -1);     // B♭
  assert.equal(accidentalShown(spell(61, NO_KEY), NO_KEY), 1);
});

test('continuous position puts in-between pitches between the naturals', () => {
  assert.equal(continuousPosition('treble', 60), -2);
  assert.equal(continuousPosition('treble', 61), -1.5);   // C♯ halfway from C to D
  assert.equal(continuousPosition('treble', 64.5), 0.5);  // E + 50 cents, halfway to F
});

test('solfège and scale degrees (movable do)', () => {
  const C = keyById('C'), Am = keyById('Am');
  assert.deepEqual([60, 62, 64, 65, 67, 69, 71].map((m) => solfege(m, C)), ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti']);
  assert.equal(solfege(66, C), 'fi');
  assert.equal(solfege(70, C), 'te');
  assert.equal(solfege(57, Am), 'do');
  assert.equal(solfege(68, Am), 'ti');   // G♯ leading tone in A minor
  assert.deepEqual(degreeOf(66, C), { degree: 4, alter: 1 });
});

test('intervals are spelled by letter: a major 3rd above E♭ is G, a perfect 4th below C is G', () => {
  const Eb = spell(63, keyById('Eb'));
  assert.equal(noteName(intervalFrom(Eb, INTERVALS.find((i) => i.id === 'M3'), 1)), 'G4');
  assert.equal(noteName(intervalFrom(spell(60, NO_KEY), INTERVALS.find((i) => i.id === 'P4'), -1)), 'G3');
  assert.equal(noteName(intervalFrom(spell(64, NO_KEY), INTERVALS.find((i) => i.id === 'm3'), 1)), 'G4');
  assert.equal(noteName(intervalFrom(spell(62, NO_KEY), INTERVALS.find((i) => i.id === 'TT'), 1)), 'G♯4');
});

// ---------- melodies ----------
const TENOR = { low: 50, high: 67 }; // D3–G4, a comfortable tenor range

test('tonic placement fits the range', () => {
  assert.equal(chooseTonic(keyById('C'), TENOR.low, TENOR.high).t, 60);
  assert.equal(chooseTonic(keyById('G'), TENOR.low, TENOR.high).t, 55);
});

test('melodies at every level: in range, in key, start and end where they should, follow the leap rules', () => {
  const triad = (d, root) => [0, 2, 4].includes((((d - root) % 7) + 7) % 7);
  for (const L of LEVELS) {
    for (const keyId of ['C', 'G', 'Eb', 'Am', 'F#m', 'Bb']) {
      const key = keyById(keyId);
      for (let seed = 1; seed <= 60; seed++) {
        const m = generateMelody({ key, level: L.n, length: 8, ...TENOR, rng: makeRng(seed * 7919 + L.n) });
        const where = `level ${L.n}, ${key.name}, seed ${seed}`;
        assert.ok(m, `no melody (${where})`);
        assert.equal(m.notes.length, 8, where);
        for (const n of m.notes) assert.ok(n.midi >= TENOR.low && n.midi <= TENOR.high, `out of range (${where})`);
        const ds = m.notes.map((n) => n.d);
        assert.equal(((ds[7] % 7) + 7) % 7, 0, `must end on the tonic (${where})`);
        if (L.n <= 2) assert.equal(ds[0], 0, `starts on the tonic (${where})`);
        for (let i = 1; i < 8; i++) {
          const a = Math.abs(ds[i] - ds[i - 1]);
          if (i >= 2) assert.ok(!(a === 0 && ds[i - 1] === ds[i - 2]), `never the same note three times running (${where})`);
          if (L.n === 1) assert.ok(a <= 1, `level 1 is steps only (${where})`);
          if (L.n === 2 && a > 1) assert.ok(triad(ds[i], 0) && triad(ds[i - 1], 0), `level 2 leaps stay in the tonic chord (${where})`);
          if (L.n === 3 && a > 1) assert.ok((triad(ds[i], 0) && triad(ds[i - 1], 0)) || (triad(ds[i], 4) && triad(ds[i - 1], 4)), `level 3 leaps stay in I or V (${where})`);
          if (L.n === 4) assert.ok(a <= 5, `level 4 leaps up to a 6th (${where})`);
          if (L.n <= 3 && i === 7) assert.equal(a, 1, `levels 1–3 end by step (${where})`);
          if (i === 7) assert.ok(a > 0, `the last note is approached from a different note (${where})`);
          if (i >= 2 && Math.abs(ds[i - 1] - ds[i - 2]) >= 3) {
            assert.equal(a, 1, `a leap of a 4th or more is followed by a step (${where})`);
            assert.notEqual(Math.sign(ds[i] - ds[i - 1]), Math.sign(ds[i - 1] - ds[i - 2]), `…in the other direction (${where})`);
          }
        }
        m.notes.forEach((n, i) => { if (n.alter) assert.equal(m.notes[i + 1].d - n.d, 1, `altered notes resolve up by step (${where})`); });
        if (L.n < 5 && key.mode === 'major') assert.ok(m.notes.every((n) => !n.alter), `no chromatic notes below level 5 (${where})`);
      }
    }
  }
});

test('same seed, same melody', () => {
  const a = generateMelody({ key: keyById('D'), level: 3, length: 6, ...TENOR, rng: makeRng(42) });
  const b = generateMelody({ key: keyById('D'), level: 3, length: 6, ...TENOR, rng: makeRng(42) });
  assert.deepEqual(a, b);
});
