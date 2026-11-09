// Random melodies for sight-singing and echo (listen and sing back), graded the way aural-skills
// courses usually order them: steps → leaps in the tonic chord → leaps in the dominant chord →
// any leap up to a 6th (resolved by step) → wider leaps and chromatic notes.
// No DOM here, so tests can import it directly.

import { scaleOf, tonicPc } from './notation.js';

/** Small seeded random generator (mulberry32), so a melody can be reproduced from its seed. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
/** Weighted pick from [{ to, w }]. */
function pickWeighted(rng, moves) {
  let total = 0;
  for (const m of moves) total += m.w;
  let r = rng() * total;
  for (const m of moves) { r -= m.w; if (r < 0) return m.to; }
  return moves[moves.length - 1].to;
}

export const LEVELS = [
  { n: 1, name: 'Steps', desc: 'Moves only to the next note up or down' },
  { n: 2, name: 'Tonic chord leaps', desc: 'Steps, plus leaps between do, mi and sol' },
  { n: 3, name: 'Dominant chord leaps', desc: 'Adds leaps between sol, ti and re' },
  { n: 4, name: 'Leaps up to a 6th', desc: 'Any leap up to a 6th, followed by a step back' },
  { n: 5, name: 'Wide & chromatic', desc: 'Leaps up to an octave, plus sharps/flats outside the key' },
];

const mod7 = (d) => ((d % 7) + 7) % 7;
/** MIDI note for scale step d (0 = tonic, 7 = octave above, −1 = the 7th below) with a chromatic alteration. */
export function degreeMidi(tonic, scale, d, alter = 0) {
  return tonic + 12 * Math.floor(d / 7) + scale[mod7(d)] + alter;
}

/** Where to put the tonic so melodies sit comfortably inside [low, high]. */
export function chooseTonic(key, low, high) {
  const scale = scaleOf(key), pc = tonicPc(key);
  let best = null;
  for (let t = low; t <= high; t++) {
    if (((t % 12) + 12) % 12 !== pc) continue;
    let dmin = 0, dmax = 0;
    while (degreeMidi(t, scale, dmin - 1) >= low) dmin--;
    while (degreeMidi(t, scale, dmax + 1) <= high) dmax++;
    // room for do…la above and sol below the tonic, and a tonic in the lower-middle of the range
    const score = Math.min(dmax, 5) + Math.min(-dmin, 3) - 0.01 * Math.abs(t - (low + 0.4 * (high - low)));
    if (!best || score > best.score) best = { t, dmin, dmax, score };
  }
  return best; // null if no tonic fits in the range at all
}

const isTriad = (d, root) => [0, 2, 4].includes(mod7(d - root));

/** Moves allowed from scale step `cur`, as [{ to, w }] with weights (steps most likely). A repeated note
 *  is allowed now and then (beginner melodies have them, and steps alone can't always get home),
 *  but never twice in a row. */
function allowedMoves(level, cur, prev, minor) {
  const moves = [];
  const leapNeedsResolving = prev !== null && Math.abs(cur - prev) >= 3;
  if (prev !== cur && !leapNeedsResolving) moves.push({ to: cur, w: 1 });
  for (let delta = -7; delta <= 7; delta++) {
    if (delta === 0) continue;
    const a = Math.abs(delta), to = cur + delta;
    if (leapNeedsResolving) { // after a leap of a 4th or more: step back the other way
      if (a === 1 && Math.sign(delta) !== Math.sign(cur - prev)) moves.push({ to, w: 3 });
      continue;
    }
    if (a === 1) { moves.push({ to, w: 3 }); continue; }
    const tritone = !minor ? [3, 6].includes(mod7(cur)) && [3, 6].includes(mod7(to)) && a === 3
      : [1, 5].includes(mod7(cur)) && [1, 5].includes(mod7(to)) && a === 3;
    if (tritone && level < 5) continue;
    const leap = { to, w: 2 };
    if (level === 2 && a <= 5 && isTriad(cur, 0) && isTriad(to, 0)) moves.push(leap);
    if (level === 3 && a <= 4 && ((isTriad(cur, 0) && isTriad(to, 0)) || (isTriad(cur, 4) && isTriad(to, 4)))) moves.push(leap);
    if (level === 4 && a <= 5) moves.push(leap);
    if (level === 5 && (a <= 5 || a === 7)) moves.push(leap);
  }
  return moves;
}

/**
 * A melody of `length` notes in `key`, inside [low, high] (MIDI), at `level` 1–5.
 * Returns { tonic, notes: [{ midi, d, alter }] } or null if the range can't fit the key.
 * Always ends on the tonic; levels 1–3 approach it by step.
 */
export function generateMelody({ key, level = 1, length = 6, low = 50, high = 67, rng = Math.random }) {
  const scale = scaleOf(key), minor = key.mode === 'minor';
  const place = chooseTonic(key, low, high);
  if (!place) return null;
  const { t, dmin, dmax } = place;
  const inRange = (d) => d >= dmin && d <= dmax;
  const tonics = [-7, 0, 7].filter(inRange);
  for (let attempt = 0; attempt < 400; attempt++) {
    const starts = (level <= 2 ? [0] : [0, 2, 4, -3]).filter(inRange);
    const ds = [pick(rng, starts)];
    let ok = true;
    for (let i = 1; i < length - 1 && ok; i++) {
      const cur = ds[i - 1], prev = i > 1 ? ds[i - 2] : null;
      const moves = allowedMoves(level, cur, prev, minor).filter((m) => inRange(m.to));
      if (!moves.length) { ok = false; break; }
      ds.push(pickWeighted(rng, moves));
    }
    if (!ok) continue;
    // final tonic: reachable from the last note under the same rules (levels 1–3 by step only)
    const last = ds[ds.length - 1], prev = ds.length > 1 ? ds[ds.length - 2] : null;
    let finals = tonics.filter((f) => f !== last && allowedMoves(level, last, prev, minor).some((m) => m.to === f));
    if (level <= 3) finals = finals.filter((f) => Math.abs(f - last) === 1);
    if (!finals.length) continue;
    ds.push(pick(rng, finals));
    if (length === 1) ds.length = 1;
    // chromatic colour at level 5 (and the leading tone in minor from level 4): only on notes that
    // then move up by step, so every altered note resolves the way it wants to
    const alters = ds.map(() => 0);
    for (let i = 0; i < ds.length - 1; i++) {
      const up = ds[i + 1] - ds[i] === 1;
      if (!up) continue;
      const deg = mod7(ds[i]);
      const nextSemis = degreeMidi(t, scale, ds[i + 1]) - degreeMidi(t, scale, ds[i]);
      if (minor && level >= 4 && deg === 6) alters[i] = 1;                 // te → ti before do
      else if (level === 5 && nextSemis === 2 && rng() < 0.35) alters[i] = 1; // e.g. fa → fi → sol
    }
    const notes = ds.map((d, i) => ({ d, alter: alters[i], midi: degreeMidi(t, scale, d, alters[i]) }));
    if (notes.some((n) => n.midi < low || n.midi > high)) continue;
    return { tonic: t, notes };
  }
  return null;
}
