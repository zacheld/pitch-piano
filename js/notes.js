// Note names, octave labels and pitch math. No DOM here, so tests can import it directly.

export const SHARPS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const FLATS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export const LOWEST_KEY = 21;  // A0
export const HIGHEST_KEY = 108; // C8

const pc = (midi) => ((midi % 12) + 12) % 12;
export const isBlack = (midi) => [1, 3, 6, 8, 10].includes(pc(midi));

/** Letter plus accidental, e.g. "C♯" or "D♭". */
export const letter = (midi, flats = false) => (flats ? FLATS : SHARPS)[pc(midi)];

/** Scientific octave number: middle C is C4. */
export const octave = (midi) => Math.floor(midi / 12) - 1;

/** Scientific pitch name, e.g. "C4", "F♯3". */
export const sciName = (midi, flats = false) => letter(midi, flats) + octave(midi);

/**
 * Karaoke-style range label (the Japanese system used by Pitch Checker and karaoke scoring).
 * Each block runs from A up to the next G♯, and mid2 is A3–G♯4, so:
 * middle C (C4) = mid2 C, A4 (440 Hz) = hi A, C5 = hi C, C3 = mid1 C, C2 = low C, C6 = hihi C.
 */
const KARAOKE = ['lowlow', 'low', 'mid1', 'mid2', 'hi', 'hihi', 'hihihi', 'hihihihi'];
export function karaokeBlock(midi) {
  const i = Math.floor((midi - 21) / 12);
  if (i < 0) return 'lowlowlow';
  return KARAOKE[Math.min(i, KARAOKE.length - 1)];
}
export const karaokeName = (midi, flats = false) => `${karaokeBlock(midi)} ${letter(midi, flats)}`;

/**
 * Helmholtz name, common in classical scores and vocal-range books:
 * C2 = C (great octave), C3 = c (small), C4 = c′ (middle C), C5 = c″, C6 = c‴, C1 = C͵, C0 = C͵͵.
 */
const PRIMES = ['', '′', '″', '‴', '⁗', '⁗′'];
export function helmholtz(midi, flats = false) {
  const o = octave(midi), l = letter(midi, flats);
  if (o >= 3) return l.toLowerCase() + PRIMES[Math.min(o - 3, PRIMES.length - 1)];
  if (o === 2) return l;
  return l + '͵'.repeat(2 - o);
}

/** Frequency (Hz) to a fractional MIDI note number, given the A4 reference. */
export const freqToMidi = (hz, a4 = 440) => 69 + 12 * Math.log2(hz / a4);
export const midiToFreq = (midi, a4 = 440) => a4 * Math.pow(2, (midi - 69) / 12);

/** Common reference pitches for A4, with what they're used for. */
export const A4_PRESETS = [
  { hz: 415, label: 'Baroque' },
  { hz: 430, label: 'Classical' },
  { hz: 440, label: 'Modern' },
  { hz: 442, label: 'Orchestra' },
  { hz: 466, label: 'Chorton' },
];
