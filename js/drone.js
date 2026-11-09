// Drone: a steady, organ-like note (the key's home note, optionally with its 5th) that keeps sounding
// while you sing, so you can hear your tuning against it: slightly out of tune, it "beats" (a slow
// wobble); in tune, the wobble disappears. Goes through the same output as the piano, so it is just
// as loud while the mic is on.

import { midiToFreq } from './notes.js';

export class Drone {
  constructor(ctx, dest) {
    this.ctx = ctx; this.dest = dest; this.voices = []; this.midi = null; this.fifth = false; this.a4 = 440;
    // a few soft harmonics: clear enough to tune against, without the decay of a piano note
    const real = new Float32Array([0, 1, 0.45, 0.28, 0.14, 0.08, 0.05]);
    this.wave = ctx.createPeriodicWave(real, new Float32Array(real.length));
  }
  get on() { return this.midi !== null; }

  start(midi, { fifth = false, a4 = 440 } = {}) {
    this.stop(0.08);
    this.midi = midi; this.fifth = fifth; this.a4 = a4;
    const now = this.ctx.currentTime;
    const notes = fifth ? [midi, midi + 7] : [midi];
    for (const m of notes) {
      const osc = this.ctx.createOscillator();
      osc.setPeriodicWave(this.wave);
      osc.frequency.value = midiToFreq(m, a4);
      const amp = this.ctx.createGain();
      amp.gain.setValueAtTime(0, now);
      amp.gain.linearRampToValueAtTime(m === midi ? 0.22 : 0.13, now + 0.6);
      osc.connect(amp).connect(this.dest);
      osc.start(now);
      this.voices.push({ osc, amp });
    }
  }

  retune(a4) { if (this.on) this.start(this.midi, { fifth: this.fifth, a4 }); }

  stop(fade = 0.4) {
    const now = this.ctx.currentTime;
    for (const v of this.voices) {
      v.amp.gain.cancelScheduledValues(now);
      v.amp.gain.setValueAtTime(v.amp.gain.value, now);
      v.amp.gain.linearRampToValueAtTime(0, now + fade);
      try { v.osc.stop(now + fade + 0.05); } catch (e) { /* already stopped */ }
    }
    this.voices = [];
    this.midi = null;
  }
}
