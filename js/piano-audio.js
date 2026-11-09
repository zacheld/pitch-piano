// Sampled grand piano: 42 recordings a whole tone apart, each note played from the nearest one.
// Retunes with the A4 setting, so the piano matches Baroque (415) or any other reference pitch.

const MAX_VOICES = 32;
/** Extra gain while the mic is on (iPhone plays everything quieter then). ×3.2 ≈ +10 dB. */
export const LOUD_BOOST = 3.2;

/** Linear up to 0.8, then rounds off smoothly towards 1.0, so the loudest peaks never hard-clip. */
function softClipCurve() {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = a <= 0.8 ? x : Math.sign(x) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
  }
  return c;
}

/** Output stage: volume -> boost -> compressor/limiter -> soft clip. Exported so tests can measure it offline. */
export function buildOutputChain(ctx) {
  const input = ctx.createGain();
  const boost = ctx.createGain();
  const comp = ctx.createDynamicsCompressor(); // keeps big sustained chords from clipping
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();
  input.connect(boost).connect(comp).connect(clip);
  const chain = {
    input, boost, comp, output: clip,
    setLoud(loud) {
      const t = ctx.currentTime;
      boost.gain.setValueAtTime(loud ? LOUD_BOOST : 1, t);
      // loud: act as a limiter, so the extra level never turns into distortion on chords
      comp.threshold.setValueAtTime(loud ? -6 : -12, t);
      comp.knee.setValueAtTime(loud ? 3 : 8, t);
      comp.ratio.setValueAtTime(loud ? 20 : 4, t);
      comp.attack.setValueAtTime(loud ? 0.002 : 0.003, t);
      comp.release.setValueAtTime(loud ? 0.15 : 0.25, t);
    },
  };
  chain.setLoud(false);
  return chain;
}

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
    this.chain = buildOutputChain(ctx);
    this.out = this.chain.input;          // everything audible (piano, drone, replays) goes in here
    this.out.gain.value = this.volume;
    this.comp = this.chain.output;
    this.comp.connect(ctx.destination);
    this.route = 'direct';
    return this.load();
  }

  /**
   * While the microphone is on, iPhone turns Web Audio playback way down (Safari switches to its
   * "video chat" audio mode). Audio played from an <audio> element with a live stream is rendered by
   * the microphone's own audio unit instead (the path call audio uses), so it stays loud.
   * on = true: send the piano through that path. on = false: the normal, lowest-latency path.
   * Call it from a tap handler the first time, so the <audio> element is allowed to play.
   */
  useCallAudio(on) {
    if (!this.ctx) return;
    if (on && !this.streamDest) {
      if (!this.ctx.createMediaStreamDestination) on = false;
      else {
        this.streamDest = this.ctx.createMediaStreamDestination();
        this.el = document.createElement('audio');
        this.el.setAttribute('playsinline', '');
        this.el.hidden = true;
        this.el.srcObject = this.streamDest.stream;
        document.body.appendChild(this.el);
      }
    }
    const want = on ? 'stream' : 'direct';
    if (want === 'stream') { const p = this.el.play(); if (p && p.catch) p.catch(() => {}); }
    this.chain.setLoud(want === 'stream');
    if (want === this.route) return;
    try { this.comp.disconnect(); } catch (e) { /* not connected */ }
    if (want === 'stream') this.comp.connect(this.streamDest);
    else { this.comp.connect(this.ctx.destination); if (this.el) this.el.pause(); }
    this.route = want;
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

  /** A note at an exact audio time (for timing checks and scheduled playback). Not tied to a key. */
  playAt(midi, when, dur, gain = 1) {
    const s = this.nearest(midi);
    if (!s || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = s.buffer;
    src.playbackRate.value = Math.pow(2, (midi - s.midi) / 12) * (this.a4 / 440);
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(s.gain * 0.75 * gain, when);
    amp.gain.setTargetAtTime(0, when + dur, 0.1);
    src.connect(amp).connect(this.out);
    src.start(when, s.offset);
    src.stop(when + dur + 1);
    const v = { src, amp };
    (this.scheduled || (this.scheduled = new Set())).add(v);
    src.onended = () => this.scheduled.delete(v);
  }
  /** Silence every note scheduled with playAt (e.g. when part-singing is stopped). */
  stopScheduled() {
    if (!this.scheduled || !this.ctx) return;
    const now = this.ctx.currentTime;
    for (const v of this.scheduled) {
      v.amp.gain.cancelScheduledValues(now); v.amp.gain.setValueAtTime(0, now);
      try { v.src.stop(now + 0.02); } catch (e) { /* not started */ }
    }
    this.scheduled.clear();
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
