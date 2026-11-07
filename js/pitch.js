// Pitch detection for a singing voice. No DOM here, so tests can run it on recordings directly.
//
// PitchDetector: McLeod Pitch Method (MPM). The normalised square difference function is computed
// with an FFT autocorrelation, so a 2048-sample frame costs two 4096-point FFTs.
// PitchTracker: turns per-frame estimates into a steady line: noise gate, clarity threshold,
// octave-jump guard, a short median filter, and a vibrato-averaged "centre" pitch for the readout.

import { freqToMidi } from './notes.js';

class FFT {
  constructor(n) {
    this.n = n;
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { this.cos[i] = Math.cos(-2 * Math.PI * i / n); this.sin[i] = Math.sin(-2 * Math.PI * i / n); }
  }
  /** In-place forward transform. */
  run(re, im) {
    const n = this.n, rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step], wi = this.sin[k * step];
          const a = start + k, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  }
}

export class PitchDetector {
  /**
   * @param {object} o
   * @param {number} o.sampleRate
   * @param {number} [o.size=2048] analysis frame length in samples
   * @param {number} [o.minHz=50]  lowest pitch reported (a low bass is ~65 Hz)
   * @param {number} [o.maxHz=2100] highest pitch reported (C7 is 2093 Hz)
   * @param {number} [o.k=0.9] MPM peak threshold: pick the first peak at least k × the best one
   */
  constructor({ sampleRate, size = 2048, minHz = 50, maxHz = 2100, k = 0.9 }) {
    this.sr = sampleRate; this.size = size; this.k = k;
    this.minLag = Math.max(2, Math.floor(sampleRate / maxHz));
    this.maxLag = Math.min(size - 2, Math.ceil(sampleRate / minHz));
    const n = 1 << Math.ceil(Math.log2(size * 2));
    this.fft = new FFT(n);
    this.re = new Float64Array(n); this.im = new Float64Array(n);
    this.x = new Float64Array(size); this.nsdf = new Float64Array(size);
  }

  /** @returns {{freq:number, clarity:number, rms:number}} freq is 0 when no pitch was found */
  detect(buf) {
    const N = this.size, x = this.x, re = this.re, im = this.im, nsdf = this.nsdf;
    const off = Math.max(0, buf.length - N);
    let mean = 0;
    for (let i = 0; i < N; i++) mean += buf[off + i] || 0;
    mean /= N;
    let energy = 0;
    for (let i = 0; i < N; i++) { const v = (buf[off + i] || 0) - mean; x[i] = v; energy += v * v; }
    const rms = Math.sqrt(energy / N);
    if (rms < 1e-5) return { freq: 0, clarity: 0, rms };

    re.fill(0); im.fill(0);
    for (let i = 0; i < N; i++) re[i] = x[i];
    this.fft.run(re, im);
    for (let i = 0; i < re.length; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
    this.fft.run(re, im); // power spectrum is real and symmetric, so a forward FFT gives n × autocorrelation
    const scale = 1 / re.length;

    let m = 2 * energy;
    nsdf[0] = 1;
    for (let t = 1; t < N; t++) {
      m -= x[t - 1] * x[t - 1] + x[N - t] * x[N - t];
      nsdf[t] = m > 1e-12 ? (2 * re[t] * scale) / m : 0;
    }

    // Key maxima: the highest point in each positive lobe after the first negative dip.
    const peaks = [];
    let t = 1;
    while (t < this.maxLag && nsdf[t] > 0) t++;
    let best = -1, bestT = 0, inLobe = false;
    for (; t <= this.maxLag; t++) {
      if (nsdf[t] > 0) {
        if (!inLobe) { inLobe = true; best = -1; }
        if (nsdf[t] > best) { best = nsdf[t]; bestT = t; }
      } else if (inLobe) {
        inLobe = false;
        if (bestT >= this.minLag) peaks.push(bestT);
      }
    }
    if (inLobe && bestT >= this.minLag && bestT < this.maxLag) peaks.push(bestT);
    if (!peaks.length) return { freq: 0, clarity: 0, rms };

    let top = 0;
    for (const p of peaks) top = Math.max(top, nsdf[p]);
    const pick = peaks.find((p) => nsdf[p] >= this.k * top);
    const a = nsdf[pick - 1], b = nsdf[pick], c = nsdf[pick + 1];
    const denom = a - 2 * b + c;
    const shift = denom !== 0 ? (a - c) / (2 * denom) : 0;
    const lag = pick + Math.max(-1, Math.min(1, shift));
    const clarity = Math.min(1, b - (a - c) * shift / 4);
    return { freq: this.sr / lag, clarity, rms };
  }
}

/** Smoothing presets: median window (frames), onset frames that must agree, centre-average window (seconds). */
/** octave: frames an octave jump must persist before it is believed; hold: seconds before the note name changes. */
export const SPEEDS = {
  fast: { median: 1, onset: 2, centre: 0.12, octave: 4, hold: 0.04 },
  normal: { median: 3, onset: 2, centre: 0.25, octave: 6, hold: 0.08 },
  smooth: { median: 5, onset: 3, centre: 0.4, octave: 8, hold: 0.12 },
};

/** Sensitivity 0..1 to an RMS gate. 1 = hears the quietest singing, 0 = only loud, close singing. */
export const gateFor = (sensitivity) => 0.04 * Math.pow(10, -2.2 * Math.max(0, Math.min(1, sensitivity)));

export class PitchTracker {
  constructor({ a4 = 440, sensitivity = 0.6, speed = 'normal', minClarity = 0.8 } = {}) {
    this.a4 = a4; this.minClarity = minClarity;
    this.setSensitivity(sensitivity); this.setSpeed(speed);
    this.reset();
  }
  setSensitivity(s) { this.gate = gateFor(s); }
  setSpeed(name) { this.speed = SPEEDS[name] || SPEEDS.normal; }
  reset() {
    this.recent = []; this.last = null; this.lastT = -1; this.steady = 0;
    this.established = false; this.onsetVals = [];
    this.jumpRun = 0; this.history = []; this.beforeJump = null; this.silentFrom = null;
  }

  /**
   * Feed one detector result. Returns:
   *  midi:   the line to draw (fractional MIDI note) or null when not singing
   *  centre: vibrato-averaged pitch for the note readout, or null
   */
  push(res, t) {
    const voiced = res.freq > 0 && res.rms >= this.gate && res.clarity >= this.minClarity;
    if (!voiced) {
      this.recent.length = 0; this.jumpRun = 0; this.established = false; this.onsetVals.length = 0;
      if (this.silentFrom == null) this.silentFrom = t;
      return { midi: null, centre: null, rms: res.rms, clarity: res.clarity };
    }
    // a fresh start after even a short breath is a new note: don't average it with the last one
    if (this.silentFrom != null && t - this.silentFrom >= 0.05) this.history.length = 0;
    this.silentFrom = null;
    let m = freqToMidi(res.freq, this.a4);

    // Octave guard: a sudden jump of ~1 or 2 octaves for a few frames is almost always a detection
    // error (a strong harmonic winning), not a real leap. Fold it back unless it persists; and if a
    // jump was believed and the pitch then returns to where it was, take the return at once.
    // It only defends a pitch that has held steady for a few frames, so a single bad frame at the
    // start of a note can never become the reference that good frames get "corrected" to.
    const recentlyHeard = this.last !== null && t - this.lastT < 0.15;
    if (recentlyHeard && this.steady >= 4) {
      const d = m - this.last, ad = Math.abs(d);
      const octs = Math.round(ad / 12);
      if (octs >= 1 && Math.abs(ad - 12 * octs) < 0.8) {
        const back = this.beforeJump && t - this.beforeJump.t < 1 && Math.abs(m - this.beforeJump.m) < 0.8;
        if (back) { this.jumpRun = 0; this.beforeJump = null; this.recent.length = 0; }
        else if (++this.jumpRun < this.speed.octave) m -= Math.sign(d) * 12 * octs;
        else { this.jumpRun = 0; this.beforeJump = { m: this.last, t }; this.recent.length = 0; }
      } else this.jumpRun = 0;
    }
    this.steady = recentlyHeard && Math.abs(m - this.last) < 1 ? this.steady + 1 : 0;
    this.last = m; this.lastT = t;

    // Onset: show nothing until the first readings of a note agree with each other (within a semitone).
    if (!this.established) {
      this.onsetVals.push(m);
      const k = this.speed.onset, tail = this.onsetVals.slice(-k);
      if (tail.length < k || Math.max(...tail) - Math.min(...tail) > 1) return { midi: null, centre: null, rms: res.rms, clarity: res.clarity };
      this.established = true; this.onsetVals.length = 0;
      this.recent = tail.slice(-this.speed.median);
    } else {
      this.recent.push(m);
      if (this.recent.length > this.speed.median) this.recent.shift();
    }
    const sorted = [...this.recent].sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];

    // Centre: mean over the last ~quarter second, which averages out classical vibrato (5–7 Hz).
    // A move of more than 1.5 semitones from the centre is a new note, not vibrato: start afresh.
    if (this.history.length) {
      let mean = 0;
      for (const h of this.history) mean += h.m;
      if (Math.abs(med - mean / this.history.length) > 1.5) this.history.length = 0;
    }
    this.history.push({ t, m: med });
    while (this.history.length && t - this.history[0].t > this.speed.centre) this.history.shift();
    let sum = 0;
    for (const h of this.history) sum += h.m;
    return { midi: med, centre: sum / this.history.length, rms: res.rms, clarity: res.clarity };
  }
}

/** The note to name in the readout. It changes only when the pitch is clearly nearer another note
 *  (so slightly sharp singing or wide vibrato doesn't flicker between two names) and has stayed
 *  there briefly (so sliding from D to E doesn't flash D♯ on the way). */
export class NoteHold {
  constructor({ margin = 0.6, hold = 0.08 } = {}) { this.margin = margin; this.hold = hold; this.reset(); }
  update(centre, t) {
    const near = Math.round(centre);
    if (this.note === null) this.note = near;
    else if (Math.abs(centre - this.note) > this.margin) {
      if (near !== this.pending) { this.pending = near; this.since = t; }
      if (t - this.since >= this.hold) { this.note = near; this.pending = null; }
    } else this.pending = null;
    return { note: this.note, cents: Math.round((centre - this.note) * 100) };
  }
  reset() { this.note = null; this.pending = null; this.since = 0; }
}
