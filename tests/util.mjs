// Test helpers: decode audio files with macOS afconvert and read the resulting 16-bit WAV.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pitchpiano-test-'));

/** Decode any file afconvert understands (m4a, flac, wav) to mono Float32 at its native rate. */
export function decode(file) {
  const out = path.join(tmp, path.basename(file).replace(/\.\w+$/, '') + '-' + Math.random().toString(36).slice(2) + '.wav');
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16', file, out]);
  const b = fs.readFileSync(out);
  let p = 12, ch = 1, rate = 44100, start = 0, size = 0;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), sz = b.readUInt32LE(p + 4);
    if (id === 'fmt ') { ch = b.readUInt16LE(p + 10); rate = b.readUInt32LE(p + 12); }
    if (id === 'data') { start = p + 8; size = Math.min(sz, b.length - start); }
    p += 8 + sz + (sz & 1);
  }
  const n = Math.floor(size / (2 * ch)), x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < ch; c++) s += b.readInt16LE(start + (i * ch + c) * 2) / 32768;
    x[i] = s / ch;
  }
  fs.unlinkSync(out);
  return { rate, x };
}

/** Run a detector over a signal in hops, returning per-frame results with timestamps. */
export function frames(detector, x, rate, { size = 2048, hop = 800, from = 0, to = x.length } = {}) {
  const out = [];
  for (let s = from; s + size <= to; s += hop) out.push({ t: (s + size) / rate, ...detector.detect(x.subarray(s, s + size)) });
  return out;
}

export const median = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : NaN; };
