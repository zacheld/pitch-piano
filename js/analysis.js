// Turning the pitch stream into musical events. No DOM here, so tests can import it directly.

/**
 * Notices when a note has been sung long enough to count: emits { type: 'write' } once per sung note
 * (after minHold seconds), then { type: 'update' } with the running average while it continues.
 * Every event also carries `recent` (the average of the last `recent` seconds: where the voice has
 * settled) and `early` (the average of the first `skip` seconds: the onset, e.g. a scoop from below).
 * A breath (note = null for longer than `gap` s) or a different note starts a new one; a dropout of a
 * frame or two (the detector missing a beat mid-note) doesn't.
 */
export class Transcriber {
  /** skip: seconds at the start of each note left out of the tuning average (the voice is still arriving). */
  constructor({ minHold = 0.25, skip = 0, recent = 0.35, gap = 0.05 } = {}) { Object.assign(this, { minHold, skip, recentWin: recent, gap }); this.cur = null; }
  reset() { this.cur = null; }
  feed(t, note, cents) {
    if (note == null) {
      if (this.cur && this.cur.gapFrom == null) this.cur.gapFrom = t;
      if (this.cur && t - this.cur.gapFrom > this.gap) this.cur = null;
      return null;
    }
    if (this.cur && this.cur.note === note && this.cur.gapFrom != null && t - this.cur.gapFrom <= this.gap) this.cur.gapFrom = null;
    if (!this.cur || this.cur.note !== note || this.cur.gapFrom != null) this.cur = { note, since: t, written: false, sum: 0, n: 0, esum: 0, en: 0, tail: [], gapFrom: null };
    const c = this.cur;
    if (t - c.since < this.skip) { c.esum += cents; c.en++; } else {
      c.sum += cents; c.n++;
      c.tail.push([t, cents]);
      while (c.tail.length && c.tail[0][0] < t - this.recentWin) c.tail.shift();
    }
    const avg = Math.round(c.n ? c.sum / c.n : c.esum / c.en);
    const recent = c.tail.length ? Math.round(c.tail.reduce((a, x) => a + x[1], 0) / c.tail.length) : avg;
    const early = c.en ? Math.round(c.esum / c.en) : null;
    if (!c.written && t - c.since >= this.minHold) { c.written = true; return { type: 'write', note, cents: avg, recent, early, since: c.since }; }
    return c.written ? { type: 'update', note, cents: avg, recent, early, since: c.since } : null;
  }
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

/**
 * Analyse one sustained note from ~60 frames/s of { t, m (the line), c (vibrato-averaged centre) }.
 * Returns the note, how long it was held, its average tuning, how much it drifted, and its vibrato
 * (rate in Hz, extent as ± cents). Onset and release (first/last 12%) are left out.
 */
export function analyzeHeldNote(frames) {
  if (frames.length < 30) return null;
  const t0 = frames[0].t, t1 = frames[frames.length - 1].t;
  const duration = t1 - t0;
  const cut = Math.floor(frames.length * 0.12);
  const mid = frames.slice(cut, frames.length - cut);
  const centres = mid.map((f) => f.c);
  const sorted = [...centres].sort((a, b) => a - b);
  const note = Math.round(sorted[sorted.length >> 1]);
  const meanCents = Math.round((mean(centres) - note) * 100);

  // drift: straight-line fit of the centre over the held part, as total cents gained or lost
  const ts = mid.map((f) => f.t), tm = mean(ts), cm = mean(centres);
  let num = 0, den = 0;
  for (let i = 0; i < mid.length; i++) { num += (ts[i] - tm) * (centres[i] - cm); den += (ts[i] - tm) ** 2; }
  const slope = den ? num / den : 0;
  const drift = Math.round(slope * (ts[ts.length - 1] - ts[0]) * 100);

  // vibrato: the line minus its own ~0.35 s moving average, then count the swings
  const half = 0.175;
  const dev = mid.map((f) => {
    let s = 0, n = 0;
    for (const g of mid) if (Math.abs(g.t - f.t) <= half) { s += g.m; n++; }
    return (f.m - s / n) * 100; // cents
  });
  // keep away from the ends, where the moving average is lopsided
  const inner = dev.slice(Math.floor(dev.length * 0.1), Math.ceil(dev.length * 0.9));
  const innerT = mid.slice(Math.floor(dev.length * 0.1), Math.ceil(dev.length * 0.9)).map((f) => f.t);
  let crossings = [], sign = 0, peaks = [], peak = 0;
  const HYST = 4; // cents: ignore jitter around zero
  for (let i = 0; i < inner.length; i++) {
    const v = inner[i];
    const s = v > HYST ? 1 : v < -HYST ? -1 : 0;
    if (s !== 0 && s !== sign) {
      if (sign !== 0) { crossings.push(innerT[i]); peaks.push(Math.abs(peak)); }
      sign = s; peak = v;
    } else if (s === sign && Math.abs(v) > Math.abs(peak)) peak = v;
  }
  let rate = null, extent = null;
  if (crossings.length >= 4) {
    const span = crossings[crossings.length - 1] - crossings[0];
    rate = +(((crossings.length - 1) / 2) / span).toFixed(1);
    extent = Math.round(mean(peaks.slice(1)));
  }
  const vibrato = rate !== null && extent >= 10 && rate >= 3 && rate <= 9;
  return { note, duration: +duration.toFixed(1), meanCents, drift, vibrato, rate: vibrato ? rate : null, extent: vibrato ? extent : null };
}
