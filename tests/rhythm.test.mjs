// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRhythm, barQ, timeline, onsets, clicks, syllable, scoreTaps, beatsOf, variant } from '../js/rhythm-core.js';
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

test('tap scoring: offsets in ms, misses and extra taps', () => {
  const s = scoreTaps([0, 0.5, 1, 1.5], [0.02, 0.47, 1.31, 1.52, 2.4]);
  assert.deepEqual(s.offsets, [20, -30, null, 20]); // 1.31 is too far from 1.0 to count… but closer to nothing else
  assert.equal(s.extra, 2);
});

test('a variant differs from the original but keeps the meter', () => {
  const rng = makeRng(4);
  const r = generateRhythm({ level: 'medium', rng });
  const v = variant(r, rng, 'medium');
  assert.equal(v.num, r.num); assert.equal(v.den, r.den);
  assert.notDeepEqual(v.bars, r.bars);
});
