// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRhythm, barQ, timeline, onsets, clicks, syllable, scoreTaps, alignTaps, soundingNotes, beatsOf, variant } from '../js/rhythm-core.js';
import { makeRng } from '../js/melody.js';

test('every generated bar adds up exactly to the time signature, at every level', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    for (let seed = 1; seed <= 300; seed++) {
      const r = generateRhythm({ level, rng: makeRng(seed) });
      for (const bar of r.bars) assert.ok(Math.abs(bar.reduce((a, e) => a + e.d, 0) - barQ(r)) < 1e-9, `${level} ${r.num}/${r.den} seed ${seed}`);
      assert.ok(!r.bars[0][0].rest, 'starts with a sound');
      if (level === 'easy') assert.ok(r.bars.flat().every((e) => [0.5, 1, 2].includes(e.d) || e.d === 4 / r.den * r.num), `easy uses simple values (${level} seed ${seed})`);
      if (level !== 'hard') assert.ok(!r.bars.flat().some((e) => e.trip) && !r.swing, 'triplets and swing only at hard');
    }
  }
});

test('meters: 6/8 is two dotted-quarter beats, 7/8 is 2+2+3', () => {
  assert.deepEqual(beatsOf(6, 8), [1.5, 1.5]);
  assert.deepEqual(beatsOf(7, 8), [1, 1, 1.5]);
  assert.deepEqual(beatsOf(3, 4), [1, 1, 1]);
});

test('onsets, ties, rests and swing', () => {
  const r = { num: 4, den: 4, beats: [1, 1, 1, 1], tempo: 60, swing: false,
    bars: [[{ d: 1 }, { d: 0.5 }, { d: 0.5 }, { d: 1, rest: true }, { d: 0.5 }, { d: 0.5, tie: true }]] };
  assert.deepEqual(onsets(r), [0, 1, 1.5, 3]); // the rest and the tied note are not attacks
  r.swing = true;
  assert.ok(Math.abs(onsets(r)[2] - (1 + 2 / 3)) < 1e-9, 'swung off-beat eighth lands two-thirds through the beat');
  assert.equal(clicks(r).length, 4);
  assert.ok(clicks(r)[0].accent && !clicks(r)[1].accent);
  assert.equal(timeline(r).filter((e) => e.attack).length, 4);
});

test('counting syllables: numbers and takadimi', () => {
  const four = { beats: [1, 1, 1, 1] }, six = { beats: [1.5, 1.5] };
  assert.deepEqual([0, 0.25, 0.5, 0.75, 1, 2.5].map((q) => syllable(q, four)), ['1', 'e', '&', 'a', '2', '&']);
  assert.deepEqual([0, 0.25, 0.5, 0.75].map((q) => syllable(q, four, 'takadimi')), ['ta', 'ka', 'di', 'mi']);
  assert.deepEqual([0, 1 / 3, 2 / 3].map((q) => syllable(q, four)), ['1', 'trip', 'let']);
  assert.deepEqual([0, 1 / 3, 2 / 3].map((q) => syllable(q, four, 'takadimi')), ['ta', 'ki', 'da']);
  assert.deepEqual([0, 0.5, 1, 1.5, 2, 2.5].map((q) => syllable(q, six)), ['1', '&', 'a', '2', '&', 'a']);
  assert.deepEqual([0, 0.5, 1].map((q) => syllable(q, six, 'takadimi')), ['ta', 'ki', 'da']);
});

test('tap alignment: offsets, misses and extra taps', () => {
  const a = alignTaps([0, 0.5, 1, 1.5], [0.02, 0.47, 1.31, 1.52, 2.4], 0.25);
  assert.deepEqual(a.match, [0, 1, -1, 3]); // 1.31 is too far from 1.0 to count
  assert.deepEqual(a.extras, [2, 4]);
});

test('tap alignment: a missed first sixteenth doesn’t shift the blame onto the notes after it', () => {
  // "nearest tap wins" gave note 1 the tap meant for note 2, and so on down the line
  const a = alignTaps([0, 0.227, 0.455, 0.682], [0.23, 0.46, 0.68], 0.3);
  assert.deepEqual(a.match, [-1, 0, 1, 2]);
  assert.deepEqual(a.extras, []);
});

test('tap alignment: an extra tap between two good ones is called extra', () => {
  const a = alignTaps([0, 0.5, 1], [0, 0.25, 0.5, 1], 0.3);
  assert.deepEqual(a.match, [0, 2, 3]);
  assert.deepEqual(a.extras, [1]);
});

const E = (d, x = {}) => ({ d, rest: false, tie: false, trip: false, ...x });
test('tap scoring: in quick notes, an extra tap plus a missed note are reported as such, not as wild offsets', () => {
  // 7/8 at ♪ = 132: eighths 0.227 s apart. Taps: note 1, an extra between 1 and 2, note 2, (note 3 missed), note 4…
  const r = { num: 7, den: 8, beats: [1, 1, 1.5], bars: [[E(0.5), E(0.5), E(0.5), E(0.5), E(0.5), E(0.5), E(0.5)]], swing: false, tempo: 66 };
  const on = soundingNotes(r).map((x) => x.start);
  const taps = [on[0], (on[0] + on[1]) / 2 + 0.02, on[1], ...on.slice(3)].map((t) => ({ t, up: null }));
  const s = scoreTaps(r, taps, { tol: 55 });
  assert.deepEqual(s.offsets.map((o) => (o == null ? null : Math.round(o))), [0, 0, null, 0, 0, 0, 0]);
  assert.equal(s.extras.length, 1);
});
test('note lengths: released on the rest, cut short, held too long; ties count as one note', () => {
  const r = { num: 4, den: 4, beats: [1, 1, 1, 1], bars: [[E(2), E(1, { rest: true }), E(1)]], swing: false, tempo: 60 };
  const notes = soundingNotes(r);
  assert.deepEqual(notes.map((x) => [x.start, x.end, x.before, x.afterRest]), [[0, 2, 'rest', false], [3, 4, 'end', true]]);
  const ok = scoreTaps(r, [{ t: 0.01, up: 1.95 }, { t: 3.0, up: 3.3 }], { tol: 70, holds: true });
  assert.deepEqual(ok.notes.map((x) => [x.off, x.hold]), [[10, 'ok'], [0, 'short']]);
  const long = scoreTaps(r, [{ t: 0, up: 2.4 }, { t: 3.02, up: 4.0 }], { tol: 70, holds: true });
  assert.deepEqual(long.notes.map((x) => x.hold), ['long', 'ok']);
  const plain = scoreTaps(r, [{ t: 0, up: 0.1 }, { t: 3, up: 3.1 }], { tol: 70 });
  assert.deepEqual(plain.notes.map((x) => x.hold), [null, null]); // lengths only when asked
  const tied = { num: 2, den: 4, beats: [1, 1], bars: [[E(1), E(1, { tie: true })]], swing: false, tempo: 60 };
  assert.deepEqual(soundingNotes(tied).map((x) => [x.start, x.end, x.before]), [[0, 2, 'end']]);
});

test('a variant differs from the original but keeps the meter', () => {
  const rng = makeRng(4);
  const r = generateRhythm({ level: 'medium', rng });
  const v = variant(r, rng, 'medium');
  assert.equal(v.num, r.num); assert.equal(v.den, r.den);
  assert.notDeepEqual(v.bars, r.bars);
});
