// Sampled grand piano: 42 recordings a whole tone apart, each note played from the nearest one.
// Retunes with the A4 setting, so the piano matches Baroque (415) or any other reference pitch.

const MAX_VOICES = 32;

export class PianoAudio {
  constructor() {
    this.ctx = null;
    this.samples = [];          // { midi, gain, buffer, offset }
    this.voices = new Map();    // midi -> { src, amp, started }
    this.a4 = 440;
    this.volume = 0.8;
    this.ready = false;
    this.onProgress = null;
  }

  /** Call once with the shared AudioContext. Starts loading the samples. */
  attach(ctx) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor(); // keeps big sustained chords from clipping
    comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    this.out.connect(comp).connect(ctx.destination);
    return this.load();
  }

  async load() {
    const index = await (await fetch('samples/index.json')).json();
    // middle of the keyboard first, so the notes you're most likely to tap are ready soonest
    index.sort((a, b) => Math.abs(a.midi - 62) - Math.abs(b.midi - 62));
    let done = 0;
    const one = async (s) => {
      const data = await (await fetch(`samples/${s.key}.m4a`)).arrayBuffer();
      const buffer = await new Promise((res, rej) => {
        const p = this.ctx.decodeAudioData(data, res, rej);
        if (p && p.then) p.then(res, rej);
      });
      // skip any silence the decoder left in front of the hammer strike
      const ch = buffer.getChannelData(0);
      let i = 0;
      while (i < ch.length && Math.abs(ch[i]) < 0.01) i++;
      const offset = Math.max(0, i - Math.round(buffer.sampleRate * 0.002)) / buffer.sampleRate;
      this.samples.push({ midi: s.midi, gain: s.gain, buffer, offset });
      this.samples.sort((a, b) => a.midi - b.midi);
      done++;
      if (this.onProgress) this.onProgress(done, index.length);
    };
    for (let i = 0; i < index.length; i += 6) await Promise.all(index.slice(i, i + 6).map(one));
    this.ready = true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.out) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  nearest(midi) {
    let best = null;
    for (const s of this.samples) if (!best || Math.abs(s.midi - midi) < Math.abs(best.midi - midi)) best = s;
    return best;
  }

  noteOn(midi) {
    if (!this.ctx) return;
    const s = this.nearest(midi);
    if (!s) return;
    const now = this.ctx.currentTime;
    this.fade(midi, now, 0.03);
    if (this.voices.size >= MAX_VOICES) {
      const oldest = [...this.voices.entries()].sort((a, b) => a[1].started - b[1].started)[0];
      this.fade(oldest[0], now, 0.05);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = s.buffer;
    src.playbackRate.value = Math.pow(2, (midi - s.midi) / 12) * (this.a4 / 440);
    const amp = this.ctx.createGain();
    amp.gain.value = s.gain * 0.75;
    src.connect(amp).connect(this.out);
    src.start(now, s.offset);
    const v = { src, amp, started: now };
    src.onended = () => { if (this.voices.get(midi) === v) this.voices.delete(midi); };
    this.voices.set(midi, v);
  }

  /** Key released. With sustain the note rings out on its own, like holding the pedal. */
  noteOff(midi, sustain) {
    if (!this.ctx || sustain) return;
    this.fade(midi, this.ctx.currentTime, 0.12);
  }

  /** Damp everything (used when sustain is switched off). */
  releaseAll(except = new Set()) {
    if (!this.ctx) return;
    for (const m of [...this.voices.keys()]) if (!except.has(m)) this.fade(m, this.ctx.currentTime, 0.12);
  }

  fade(midi, now, tc) {
    const v = this.voices.get(midi);
    if (!v) return;
    this.voices.delete(midi);
    v.amp.gain.cancelScheduledValues(now);
    v.amp.gain.setValueAtTime(v.amp.gain.value, now);
    v.amp.gain.setTargetAtTime(0, now, tc);
    try { v.src.stop(now + tc * 8); } catch (e) { /* already stopped */ }
  }
}
