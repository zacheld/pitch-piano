// Downloads the source piano recordings (VCSL "Grand Piano, Steinway B", CC0) into a folder.
// Usage: node tools/fetch-samples.mjs <download-dir>
// Notes are recorded every whole tone (C D E F# G# A#) from A#0 to G#7, velocity layer 3, round-robin 1.
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) { console.error('usage: node tools/fetch-samples.mjs <download-dir>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });

const BASE = 'https://raw.githubusercontent.com/sgossner/VCSL/master/Chordophones/Zithers/Grand%20Piano%2C%20Steinway%20B/NoSus/';
const names = [];
for (let o = 0; o <= 7; o++) for (const n of ['C', 'D', 'E', 'F#', 'G#', 'A#']) names.push(n + o);

async function get(note) {
  const file = path.join(out, note.replace('#', 's') + '.wav');
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return 'have';
  const url = BASE + encodeURIComponent(`JHPiano_NoSus_Close_${note}_vl3_rr1.wav`);
  const res = await fetch(url);
  if (!res.ok) return 'missing';
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return 'ok';
}

const results = {};
for (let i = 0; i < names.length; i += 8) {
  const batch = names.slice(i, i + 8);
  const r = await Promise.all(batch.map(get));
  batch.forEach((n, j) => { results[n] = r[j]; });
}
const got = Object.entries(results).filter(([, v]) => v !== 'missing').map(([k]) => k);
const missing = Object.entries(results).filter(([, v]) => v === 'missing').map(([k]) => k);
console.log(`have ${got.length}: ${got.join(' ')}`);
console.log(`not in the library: ${missing.join(' ') || 'none'}`);
