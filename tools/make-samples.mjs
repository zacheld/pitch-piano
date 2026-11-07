// Turns the downloaded VCSL piano WAVs into small AAC (.m4a) files for the app.
// Usage: node tools/make-samples.mjs <download-dir> <work-dir>
// Per note: mix to mono, trim the silence before the hammer strike, cut to a length that suits the
// register (bass rings longer), fade out, write 16-bit WAV, then encode AAC with macOS afconvert.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [src, work] = process.argv.slice(2);
if (!src || !work) { console.error('usage: node tools/make-samples.mjs <download-dir> <work-dir>'); process.exit(1); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'samples');
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const PCS = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midiOf = (name) => { const m = /^([A-G]#?)(\d)$/.exec(name); return 12 * (+m[2] + 1) + PCS[m[1]]; };

function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV: ' + file);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(p + 8), channels: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') data = { start: p + 8, size: Math.min(size, b.length - p - 8) };
    p += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('missing fmt/data: ' + file);
  if (fmt.bits !== 24 && fmt.bits !== 16) throw new Error('unsupported bit depth ' + fmt.bits);
  const bps = fmt.bits / 8, frame = bps * fmt.channels, n = Math.floor(data.size / frame);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const o = data.start + i * frame + c * bps;
      s += fmt.bits === 24 ? (b.readIntLE(o, 3) / 8388608) : (b.readInt16LE(o) / 32768);
    }
    mono[i] = s / fmt.channels;
  }
  return { rate: fmt.rate, x: mono };
}

function writeWav16(file, x, rate) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b);
}

// Seconds kept per register: low strings ring for a long time, the top octave dies quickly.
const lengthFor = (midi) => (midi < 48 ? 9 : midi < 60 ? 7 : midi < 72 ? 6 : midi < 84 ? 4 : 2.5);

const files = fs.readdirSync(src).filter((f) => f.endsWith('.wav')).sort();
const index = [];
for (const f of files) {
  const name = f.replace('.wav', '').replace('s', '#');
  const midi = midiOf(name);
  const { rate, x } = readWav(path.join(src, f));
  // onset: first sample above 3% of the early peak, minus 3 ms of lead-in
  let peak = 0;
  for (let i = 0; i < Math.min(x.length, rate * 2); i++) peak = Math.max(peak, Math.abs(x[i]));
  let on = 0;
  while (on < x.length && Math.abs(x[on]) < peak * 0.03) on++;
  const start = Math.max(0, on - Math.round(rate * 0.003));
  const len = Math.min(x.length - start, Math.round(rate * lengthFor(midi)));
  const y = x.slice(start, start + len);
  const fadeIn = Math.round(rate * 0.001), fadeOut = Math.round(len * 0.3);
  for (let i = 0; i < fadeIn; i++) y[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i++) y[len - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / fadeOut);
  // loudness of the first 150 ms after the strike, used to even out levels between recordings
  let e = 0; const w = Math.min(len, Math.round(rate * 0.15));
  for (let i = 0; i < w; i++) e += y[i] * y[i];
  const rms = Math.sqrt(e / w);
  let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(y[i]));
  const key = name.replace('#', 's');
  const wav = path.join(work, key + '.wav');
  writeWav16(wav, y, rate);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '96000', '-q', '127', wav, path.join(outDir, key + '.m4a')]);
  // target loudness: level through the middle, easing off in the top octave like a real piano
  const target = midi <= 84 ? 0.13 : 0.13 - (midi - 84) * 0.002;
  const gain = Math.max(0.5, Math.min(2.5, target / rms));
  index.push({ key, midi, seconds: +(len / rate).toFixed(2), gain: +gain.toFixed(3) });
  console.log(`${name.padEnd(4)} midi ${midi}  ${(len / rate).toFixed(1)} s  rms ${rms.toFixed(3)}  peak ${pk.toFixed(3)}`);
}
index.sort((a, b) => a.midi - b.midi);
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
let total = 0; for (const f of fs.readdirSync(outDir).filter((n) => n.endsWith('.m4a'))) total += fs.statSync(path.join(outDir, f)).size;
console.log(`${index.length} files, ${(total / 1e6).toFixed(2)} MB in samples/`);
