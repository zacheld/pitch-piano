// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PitchDetector, PitchTracker } from '../js/pitch.js';
import { sciName, karaokeName, helmholtz, freqToMidi, midiToFreq } from '../js/notes.js';
import { decode, frames, median } from './util.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SR = 48000;
const cents = (hz, ref) => 1200 * Math.log2(hz / ref);

// A voice-like tone: harmonics shaped by a glottal roll-off and "ah" formants (700, 1220, 2600 Hz).
// At low pitches the fundamental is much weaker than harmonics near 700 Hz, the classic octave-error trap.
function voice(f0, seconds, { vibratoCents = 0, vibratoHz = 5.5, noise = 0, sr = SR } = {}) {
  const n = Math.round(seconds * sr), x = new Float32Array(n);
  const formant = (f) => [[700, 110], [1220, 120], [2600, 160]].reduce((a, [c, bw]) => a + 1 / (1 + ((f - c) / bw) ** 2), 0);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = f0 * Math.pow(2, vibratoCents / 1200 * Math.sin(2 * Math.PI * vibratoHz * t));
    phase += 2 * Math.PI * f / sr;
    let s = 0;
    for (let h = 1; h * f < 6000; h++) s += (1 / h) * formant(h * f0) * Math.sin(h * phase);
    x[i] = 0.2 * s + noise * (Math.random() * 2 - 1);
  }
  return x;
}

test('note names and octave labels', () => {
  assert.equal(sciName(60), 'C4');
  assert.equal(sciName(61, true), 'D♭4');
  assert.equal(karaokeName(60), 'mid2 C');     // middle C
  assert.equal(karaokeName(57), 'mid2 A');     // A3, start of mid2
  assert.equal(karaokeName(68), 'mid2 G♯');    // G#4, end of mid2
  assert.equal(karaokeName(69), 'hi A');       // A4 = 440 Hz
  assert.equal(karaokeName(72), 'hi C');       // C5
  assert.equal(karaokeName(48), 'mid1 C');     // C3
  assert.equal(karaokeName(36), 'low C');      // C2
  assert.equal(karaokeName(38), 'low D');      // D2
  assert.equal(karaokeName(24), 'lowlow C');   // C1
  assert.equal(karaokeName(84), 'hihi C');     // C6
  assert.equal(karaokeName(21), 'lowlow A');   // A0, lowest piano key
  assert.equal(helmholtz(60), 'c′');
  assert.equal(helmholtz(48), 'c');
  assert.equal(helmholtz(36), 'C');
  assert.equal(helmholtz(24), 'C͵');
  assert.equal(helmholtz(81), 'a″');
  assert.equal(helmholtz(84), 'c‴');
  assert.ok(Math.abs(freqToMidi(415, 415) - 69) < 1e-9);
  assert.ok(Math.abs(midiToFreq(60) - 261.6256) < 1e-3);
});

test('steady voice-like tones from 65 Hz to 2 kHz: within 3 cents, no octave errors', () => {
  const det = new PitchDetector({ sampleRate: SR });
  const worst = [];
  for (let midi = 36; midi <= 96; midi += 2) {
    const f0 = midiToFreq(midi);
    const res = frames(det, voice(f0, 0.6), SR).filter((r) => r.freq > 0);
    assert.ok(res.length > 10, `${sciName(midi)}: no pitch found`);
    const errs = res.map((r) => cents(r.freq, f0));
    const octaveErrors = errs.filter((e) => Math.abs(e) > 300).length;
    assert.equal(octaveErrors, 0, `${sciName(midi)}: ${octaveErrors} frames off by an octave or more`);
    const maxErr = Math.max(...errs.map(Math.abs));
    worst.push(maxErr);
    assert.ok(maxErr < 3, `${sciName(midi)}: worst frame ${maxErr.toFixed(2)} cents`);
  }
  console.log(`  worst error across range: ${Math.max(...worst).toFixed(2)} cents`);
});

test('works at 44.1 kHz too (some iPhones and headsets run at 44.1)', () => {
  const det = new PitchDetector({ sampleRate: 44100 });
  for (const midi of [40, 57, 69, 81]) {
    const f0 = midiToFreq(midi);
    const res = frames(det, voice(f0, 0.5, { sr: 44100 }), 44100).filter((r) => r.freq > 0);
    assert.ok(Math.abs(cents(median(res.map((r) => r.freq)), f0)) < 3, sciName(midi));
  }
});

test('noisy room (about 20 dB below the voice): still within 10 cents', () => {
  const det = new PitchDetector({ sampleRate: SR });
  for (const midi of [43, 55, 64, 72, 79]) {
    const f0 = midiToFreq(midi);
    const res = frames(det, voice(f0, 0.6, { noise: 0.03 }), SR).filter((r) => r.freq > 0 && r.clarity > 0.8);
    assert.ok(res.length > 10, sciName(midi));
    assert.ok(Math.abs(cents(median(res.map((r) => r.freq)), f0)) < 10, sciName(midi));
  }
});

test('classical vibrato (±60 cents at 5.5 Hz): the trace swings, the centre stays on the note', () => {
  const det = new PitchDetector({ sampleRate: SR });
  for (const midi of [50, 62, 74]) {
    const f0 = midiToFreq(midi);
    const trk = new PitchTracker();
    const x = voice(f0, 2, { vibratoCents: 60 });
    let swing = 0;
    const centres = [];
    for (const r of frames(det, x, SR)) {
      const o = trk.push(r, r.t);
      if (o.midi !== null) swing = Math.max(swing, Math.abs(o.midi - midi) * 100);
      if (o.centre !== null && r.t > 0.5) centres.push((o.centre - midi) * 100);
    }
    assert.ok(swing > 40, `${sciName(midi)}: trace should show the vibrato (swing ${swing.toFixed(0)} c)`);
    const worstCentre = Math.max(...centres.map(Math.abs));
    assert.ok(worstCentre < 15, `${sciName(midi)}: centre wandered ${worstCentre.toFixed(1)} cents`);
  }
});

test('noise alone is not reported as singing', () => {
  const det = new PitchDetector({ sampleRate: SR });
  const trk = new PitchTracker();
  const x = new Float32Array(SR);
  for (let i = 0; i < x.length; i++) x[i] = 0.05 * (Math.random() * 2 - 1);
  const out = frames(det, x, SR).map((r) => trk.push(r, r.t));
  const voiced = out.filter((o) => o.midi !== null).length;
  assert.ok(voiced / out.length < 0.03, `${voiced}/${out.length} noise frames voiced`);
});

test('tracker folds a brief octave slip back onto the line', () => {
  const trk = new PitchTracker({ speed: 'fast' });
  const f = midiToFreq(57);
  let t = 0;
  const feed = (hz) => trk.push({ freq: hz, clarity: 0.95, rms: 0.05 }, (t += 1 / 60));
  for (let i = 0; i < 10; i++) feed(f);
  const slip = feed(f * 2);
  assert.ok(Math.abs(slip.midi - 57) < 0.01, 'one-frame octave jump should fold back');
  for (let i = 0; i < 8; i++) feed(f * 2);
  assert.ok(Math.abs(feed(f * 2).midi - 69) < 0.01, 'a held octave leap should be accepted');
});

test('piano samples: every recording detects as its own note', () => {
  const idx = JSON.parse(fs.readFileSync(path.join(root, 'samples/index.json'), 'utf8'));
  const bad = [];
  for (const s of idx) {
    if (midiToFreq(s.midi) < 50 || midiToFreq(s.midi) > 2100) continue; // outside the 50–2100 Hz singing range the detector covers
    const { rate, x } = decode(path.join(root, 'samples', s.key + '.m4a'));
    const det = new PitchDetector({ sampleRate: rate });
    const res = frames(det, x, rate, { from: Math.round(rate * 0.15), to: Math.round(rate * 1.2) }).filter((r) => r.clarity > 0.8);
    const err = res.length ? cents(median(res.map((r) => r.freq)), midiToFreq(s.midi)) : NaN;
    if (!(Math.abs(err) < 25)) bad.push(`${sciName(s.midi)} ${isNaN(err) ? 'no pitch' : err.toFixed(0) + 'c'}`);
  }
  assert.deepEqual(bad, []);
});

test('real sung recordings (from the synth project, if present): no octave errors', (t) => {
  const dir = '/Users/zacheld/Chord-Synth/assets-src/samples';
  if (!fs.existsSync(dir)) return t.skip('synth project not found');
  const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  for (const id of ['voxahh', 'humming']) {
    const ins = man.instruments.find((i) => i.id === id);
    for (const f of ins.files) {
      const expected = f.detectedMidi ?? f.rootMidi;
      const { rate, x } = decode(path.join(dir, id, f.file));
      const det = new PitchDetector({ sampleRate: rate });
      const trk = new PitchTracker();
      const out = frames(det, x, rate).map((r) => trk.push(r, r.t)).filter((o) => o.midi !== null);
      assert.ok(out.length > 5, `${id}/${f.file}: no pitch`);
      const offOctave = out.filter((o) => Math.abs(o.midi - expected) > 6).length;
      const med = median(out.map((o) => o.midi));
      console.log(`  ${id}/${f.file}: expected ${expected.toFixed(2)}, median ${med.toFixed(2)}, ${offOctave}/${out.length} frames > 6 semitones off`);
      assert.ok(Math.abs(med - expected) < 0.5, `${id}/${f.file}: median ${med.toFixed(2)} vs ${expected}`);
      assert.ok(offOctave / out.length < 0.05, `${id}/${f.file}: ${offOctave}/${out.length} frames far off`);
    }
  }
});

// A legato scale (no breaths), with vibrato, through semitone and whole-tone steps.
function legato(notes, secondsEach, sr = SR) {
  const n = Math.round(notes.length * secondsEach * sr), x = new Float32Array(n);
  const formant = (f) => [[700, 110], [1220, 120], [2600, 160]].reduce((a, [c, bw]) => a + 1 / (1 + ((f - c) / bw) ** 2), 0);
  let ph = 0, cur = notes[0];
  for (let i = 0; i < n; i++) {
    const t = i / sr, target = notes[Math.min(notes.length - 1, Math.floor(t / secondsEach))];
    cur += (target - cur) * (1 - Math.exp(-1 / (sr * 0.03)));  // 30 ms portamento between notes
    const f0 = midiToFreq(cur + (50 / 100) * Math.sin(2 * Math.PI * 5.8 * t));
    ph += 2 * Math.PI * f0 / sr;
    let s = 0;
    for (let h = 1; h * f0 < 5000; h++) s += (1 / h) * formant(h * f0) * Math.sin(h * ph);
    x[i] = 0.2 * s;
  }
  return x;
}

test('legato scale with vibrato: the note name never flashes a note that was not sung', async () => {
  const { NoteHold } = await import('../js/pitch.js');
  const scale = [57, 59, 60, 62, 64, 65, 67, 69, 67, 65, 64, 62, 60];
  const det = new PitchDetector({ sampleRate: SR });
  const trk = new PitchTracker(), hold = new NoteHold();
  const shown = [];
  for (const r of frames(det, legato(scale, 0.7), SR)) {
    const o = trk.push(r, r.t);
    if (o.centre !== null) { const { note } = hold.update(o.centre, r.t); if (shown[shown.length - 1] !== note) shown.push(note); }
  }
  const strays = shown.filter((n) => !scale.includes(n));
  assert.deepEqual(strays, [], `readout sequence: ${shown.map((n) => sciName(n)).join(' ')}`);
  assert.deepEqual(shown, scale.filter((n, i) => i === 0 || n !== scale[i - 1]), 'every note shown, in order');
});

test('note starts never flash the wrong octave, whatever the frame timing (5 sung notes × 22 timings)', async () => {
  const { NoteHold } = await import('../js/pitch.js');
  const sr = SR, notes = [60, 62, 64, 65, 67], dur = 0.9, gap = 0.12;
  const n = Math.round(sr * notes.length * (dur + gap) + sr * 0.5), x = new Float32Array(n);
  let i = Math.round(sr * 0.3);
  for (const m of notes) {               // the same test singer the browser check uses: 50 ms attacks, breaths between notes
    const tone = voice(midiToFreq(m), dur, { vibratoCents: 40 });
    for (let k = 0; k < tone.length; k++, i++) { const t = k / sr; x[i] = tone[k] * Math.min(1, t / 0.05, (dur - t) / 0.05); }
    i += Math.round(sr * gap);
  }
  const hop = 800, failures = [];
  for (let off = 0; off < hop; off += 37) {
    const det = new PitchDetector({ sampleRate: sr }), trk = new PitchTracker(), hold = new NoteHold();
    let lastVoiced = -1;
    for (let s = off; s + 2048 <= n; s += hop) {
      const t = (s + 2048) / sr, o = trk.push(det.detect(x.subarray(s, s + 2048)), t);
      if (o.midi !== null && !notes.some((m) => Math.abs(o.midi - m) < 1.5)) failures.push(`timing ${off}: line at ${o.midi.toFixed(1)}`);
      if (o.centre !== null) {
        lastVoiced = t;
        const shown = hold.update(o.centre, t).note;
        if (!notes.includes(shown)) failures.push(`timing ${off}: readout ${sciName(shown)}`);
      } else if (t - lastVoiced > 0.1) hold.reset();
    }
  }
  assert.deepEqual(failures.slice(0, 5), []);
});
