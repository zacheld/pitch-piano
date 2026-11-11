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
 * Every sounding note (a tied note counts once): start and end in q and in seconds from the downbeat (swing
 * applied), and what follows it ('note', 'rest' or 'end'). `afterRest`: the note comes straight after a rest.
 */
export function soundingNotes(r) {
  const spq = 60 / r.tempo, tl = timeline(r), out = [];
  tl.forEach((e, i) => {
    if (!e.attack) return;
    let j = i + 1, endQ = e.q + e.d;
    while (j < tl.length && tl[j].tie && !tl[j].rest) { endQ = tl[j].q + tl[j].d; j++; }
    const next = tl[j], prev = tl[i - 1];
    out.push({ q: e.q, endQ, start: swung(e.q, r) * spq, end: swung(endQ, r) * spq,
      before: !next ? 'end' : next.rest ? 'rest' : 'note', afterRest: !!(prev && prev.rest) });
  });
  return out;
}

/**
 * Lines taps up with the written notes the way you'd compare two texts (dynamic programming): taps stay in
 * order, each goes to at most one note, a note with no tap near it is missed and a tap near no note is extra.
 * Unlike "nearest tap wins", one missing or extra tap can't shift the blame onto the notes around it.
 * expected: onset times; taps: tap times (both seconds from the downbeat, sorted); window: furthest a tap
 * may be from its note (one number, or one per note). Returns match (tap index per note, −1 = missed)
 * and extras (tap indices).
 */
export function alignTaps(expected, taps, window = 0.3) {
  const win = (i) => (Array.isArray(window) ? window[i] : window);
  const n = expected.length, m = taps.length;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity));
  const how = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  cost[0][0] = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const c = cost[i][j];
      if (c === Infinity) continue;
      if (i < n && c + 1 < cost[i + 1][j]) { cost[i + 1][j] = c + 1; how[i + 1][j] = 1; }         // note i missed
      if (j < m && c + 1 < cost[i][j + 1]) { cost[i][j + 1] = c + 1; how[i][j + 1] = 2; }         // tap j extra
      if (i < n && j < m) {
        const d = Math.abs(taps[j] - expected[i]), w = win(i);
        const v = c + 0.9 * (d / w) ** 2;                                                          // < 2: a match beats miss + extra
        if (d <= w && v < cost[i + 1][j + 1]) { cost[i + 1][j + 1] = v; how[i + 1][j + 1] = 3; }
      }
    }
  }
  const match = new Array(n).fill(-1), extras = [];
  for (let i = n, j = m; i > 0 || j > 0;) {
    const h = how[i][j];
    if (h === 3) { match[i - 1] = j - 1; i--; j--; } else if (h === 1) i--; else { extras.push(j - 1); j--; }
  }
  return { match, extras: extras.reverse() };
}

/**
 * Score a tapped rhythm. taps: [{ t, up }] (seconds from the downbeat; up = release, null if not known).
 * tol: ms that counts as on time. holds: also judge how long notes are held.
 * Lengths are judged where you'd hear them: a note before a rest or at the end should be released on time
 * (within tolerance), and a note a beat or longer followed by another shouldn't be let go much before it ends.
 * Short notes straight into the next note are just tapped.
 */
export function scoreTaps(r, taps, { tol = 70, holds = false } = {}) {
  const notes = soundingNotes(r), spq = 60 / r.tempo;
  const beatS = Math.min(...r.beats) * spq;
  // how far a tap may be from its note: up to ~half a beat, but never past halfway to the next or previous
  // note (in quick passages a tap that far out is a wrong or extra tap, not that note played very early)
  const maxWin = Math.max(0.18, Math.min(0.35, 0.45 * Math.max(...r.beats) * spq));
  const windows = notes.map((nt, i) => {
    const gap = Math.min(i > 0 ? nt.start - notes[i - 1].start : Infinity, i < notes.length - 1 ? notes[i + 1].start - nt.start : Infinity);
    return Math.max(0.08, Math.min(maxWin, gap / 2));
  });
  taps = [...taps].sort((a, b) => a.t - b.t);
  const { match, extras } = alignTaps(notes.map((x) => x.start), taps.map((x) => x.t), windows);
  const res = notes.map((nt, i) => {
    const tap = match[i] >= 0 ? taps[match[i]] : null;
    const out = { q: nt.q, endQ: nt.endQ, off: tap ? Math.round((tap.t - nt.start) * 1000) : null, hold: null, release: null, afterRest: nt.afterRest };
    if (!tap || !holds || tap.up == null) return out;
    out.upQ = tap.up / spq; out.downQ = tap.t / spq;
    const len = nt.end - nt.start;
    out.release = Math.round((tap.up - nt.end) * 1000);
    if (nt.before === 'note') {
      if (len >= 0.9 * beatS) out.hold = tap.up < nt.end - Math.max(0.15, 0.25 * len) ? 'short' : 'ok';
    } else {
      const slack = Math.max(1.6 * tol / 1000, 0.15 * len);
      out.hold = tap.up < nt.end - slack ? 'short' : tap.up > nt.end + slack ? 'long' : 'ok';
    }
    return out;
  });
  return { notes: res, extras: extras.map((j) => ({ q: taps[j].t / spq })), offsets: res.map((x) => x.off) };
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
