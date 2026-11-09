// Rhythm: generator, timing and counting syllables. No DOM here, so tests can import it directly.
// Durations are in quarter notes (q): 1 = quarter, 0.5 = eighth, 1/3 = triplet eighth, 1.5 = dotted quarter.
// A rhythm: { num, den, beats: [beat lengths in q], bars: [[{ d, rest, tie, trip }]], swing, tempo }.

const T = 1 / 3;
const ev = (d, extra = {}) => ({ d, rest: false, tie: false, trip: false, ...extra });
const R = (d) => ev(d, { rest: true });

// Patterns that fill one simple beat (1 q), by level.
const BEAT = {
  easy: [[ev(1)], [ev(1)], [ev(0.5), ev(0.5)], [ev(0.5), ev(0.5)], [R(1)]],
  medium: [[ev(1)], [ev(0.5), ev(0.5)], [ev(0.25), ev(0.25), ev(0.25), ev(0.25)], [ev(0.5), ev(0.25), ev(0.25)],
    [ev(0.25), ev(0.25), ev(0.5)], [R(0.5), ev(0.5)], [ev(0.75), ev(0.25)], [R(1)]],
  hard: [[ev(1)], [ev(0.5), ev(0.5)], [ev(T, { trip: true }), ev(T, { trip: true }), ev(T, { trip: true })], [ev(0.25), ev(0.5), ev(0.25)],
    [ev(0.75), ev(0.25)], [R(0.25), ev(0.25), ev(0.25), ev(0.25)], [ev(0.25), ev(0.25), ev(0.25), ev(0.25)], [R(0.5), ev(0.5)],
    [ev(T, { trip: true }), ev(T, { trip: true }), ev(T, { trip: true })]],
};
// Patterns spanning two simple beats.
const TWO = {
  easy: [[ev(2)]],
  medium: [[ev(2)], [ev(1.5), ev(0.5)], [ev(0.5), ev(1), ev(0.5)]],
  hard: [[ev(1.5), ev(0.5)], [ev(0.5), ev(1), ev(0.5)], [ev(0.5), ev(1.5)], [ev(0.5), ev(0.5, {}), ev(0.5, { tie: true }), ev(0.5)]],
};
// Patterns filling one compound beat (a dotted quarter = 3 eighths).
const COMPOUND = [[ev(0.5), ev(0.5), ev(0.5)], [ev(1), ev(0.5)], [ev(1.5)], [ev(0.5), ev(1)], [ev(0.75), ev(0.25), ev(0.5)], [R(0.5), ev(0.5), ev(0.5)]];

export const METERS = {
  easy: [[4, 4], [3, 4], [2, 4]],
  medium: [[4, 4], [3, 4], [6, 8], [2, 4]],
  hard: [[4, 4], [6, 8], [5, 4], [7, 8], [3, 4]],
};

/** Beat lengths (in q) for a time signature: 6/8 = two dotted quarters, 7/8 = 2+2+3 eighths. */
export function beatsOf(num, den) {
  if (den === 8 && num === 6) return [1.5, 1.5];
  if (den === 8 && num === 7) return [1, 1, 1.5];
  if (den === 8 && num === 3) return [1.5];
  if (den === 8 && num === 9) return [1.5, 1.5, 1.5];
  if (den === 8 && num === 12) return [1.5, 1.5, 1.5, 1.5];
  return Array.from({ length: num }, () => 4 / den);
}
const clone = (p) => p.map((e) => ({ ...e }));

/** A random rhythm of `bars` bars at a level ('easy' | 'medium' | 'hard'). */
export function generateRhythm({ level = 'easy', bars = 2, rng = Math.random, meter = null, tempo = null } = {}) {
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const [num, den] = meter || pick(METERS[level]);
  const beats = beatsOf(num, den);
  const out = [];
  for (let b = 0; b < bars; b++) {
    const bar = [];
    for (let i = 0; i < beats.length;) {
      const L = beats[i];
      if (L === 1.5) { bar.push(...clone(pick(COMPOUND))); i++; continue; }
      // two simple beats together sometimes (half notes, dotted figures, syncopation)
      if (i + 1 < beats.length && beats[i + 1] === 1 && rng() < (level === 'easy' ? 0.25 : 0.35)) { bar.push(...clone(pick(TWO[level]))); i += 2; continue; }
      bar.push(...clone(pick(BEAT[level]))); i++;
    }
    if (bar.every((e) => e.rest)) bar[0].rest = false;
    if (bar.filter((e) => e.rest).length > (level === 'easy' ? 1 : 2)) { b--; continue; } // not too many rests
    out.push(bar);
  }
  if (out[0][0].rest) out[0][0].rest = false; // start with a sound
  const hasSixteenths = out.flat().some((e) => e.d === 0.25 || e.d === 0.75);
  const swing = level === 'hard' && den === 4 && !hasSixteenths && !out.flat().some((e) => e.trip) && rng() < 0.4;
  return { num, den, beats, bars: out, swing, tempo: tempo || (level === 'easy' ? 80 : level === 'medium' ? 72 : 66) };
}

/** Bar length in q. */
export const barQ = (r) => r.beats.reduce((a, b) => a + b, 0);

/** Swing: an eighth note starting halfway through a beat is played two-thirds of the way through it. */
const swung = (q, r) => {
  if (!r.swing) return q;
  const beat = Math.floor(q + 1e-9), f = q - beat;
  return Math.abs(f - 0.5) < 1e-6 ? beat + 2 / 3 : q;
};

/** Every event with its start position (q from the start), and whether it's an attack you'd tap. */
export function timeline(r) {
  const out = [];
  let q = 0;
  r.bars.forEach((bar, bi) => {
    bar.forEach((e, ei) => {
      out.push({ ...e, q, bar: bi, index: ei, attack: !e.rest && !e.tie });
      q += e.d;
    });
  });
  return out;
}

/** Times (seconds after the first downbeat) of every attack, with swing applied. */
export function onsets(r) {
  const spq = 60 / r.tempo;
  return timeline(r).filter((e) => e.attack).map((e) => swung(e.q, r) * spq);
}

/** Times of the metronome clicks for the whole rhythm (one per beat), with accents on each bar's first beat. */
export function clicks(r) {
  const spq = 60 / r.tempo, out = [];
  let q = 0;
  for (let b = 0; b < r.bars.length; b++) r.beats.forEach((L, i) => { out.push({ t: q * spq, accent: i === 0 }); q += L; });
  return out;
}

/** Counting syllable for a note starting at q within its bar. system: 'numbers' | 'takadimi'. */
export function syllable(qInBar, r, system = 'numbers') {
  let start = 0, beat = 0;
  for (; beat < r.beats.length; beat++) { if (qInBar < start + r.beats[beat] - 1e-6) break; start += r.beats[beat]; }
  const L = r.beats[Math.min(beat, r.beats.length - 1)], f = +(qInBar - start).toFixed(4);
  const near = (x) => Math.abs(f - x) < 0.02;
  const num = String(beat + 1);
  if (L === 1.5) { // compound beat: three eighths
    if (near(0)) return system === 'takadimi' ? 'ta' : num;
    if (near(0.5)) return system === 'takadimi' ? 'ki' : '&';
    if (near(1)) return system === 'takadimi' ? 'da' : 'a';
    if (near(0.25)) return system === 'takadimi' ? 'va' : 'e';
    if (near(0.75)) return system === 'takadimi' ? 'di' : 'e';
    return system === 'takadimi' ? 'ma' : 'a';
  }
  if (near(0)) return system === 'takadimi' ? 'ta' : num;
  if (near(1 / 3)) return system === 'takadimi' ? 'ki' : 'trip';
  if (near(2 / 3)) return system === 'takadimi' ? 'da' : 'let';
  if (near(0.25)) return system === 'takadimi' ? 'ka' : 'e';
  if (near(0.5)) return system === 'takadimi' ? 'di' : '&';
  if (near(0.75)) return system === 'takadimi' ? 'mi' : 'a';
  return '';
}

/**
 * Match taps to expected onsets (both in seconds from the downbeat). Each onset takes the nearest
 * unused tap within `window`. Returns per-onset offsets in ms (null = missed) and the count of extra taps.
 */
export function scoreTaps(expected, taps, window = 0.25) {
  const used = new Set();
  const offsets = expected.map((t) => {
    let best = -1, bestD = Infinity;
    taps.forEach((x, i) => { const d = Math.abs(x - t); if (!used.has(i) && d < bestD && d <= window) { best = i; bestD = d; } });
    if (best < 0) return null;
    used.add(best);
    return Math.round((taps[best] - t) * 1000);
  });
  return { offsets, extra: taps.length - used.size };
}

/** A different rhythm with the same meter, changed in one beat (for "which did you hear?" questions). */
export function variant(r, rng, level) {
  for (let tries = 0; tries < 30; tries++) {
    const other = generateRhythm({ level, bars: r.bars.length, rng, meter: [r.num, r.den], tempo: r.tempo });
    const a = JSON.stringify(r.bars.map((b) => b.map((e) => [e.d, e.rest, e.tie]))), b = JSON.stringify(other.bars.map((x) => x.map((e) => [e.d, e.rest, e.tie])));
    if (a !== b) return { ...other, swing: r.swing };
  }
  return null;
}
