// Copy the built chord synth (the HiChord emulator) into synth/: node tools/sync-synth.mjs [path/to/Chord-Synth]
// It runs unchanged as its own page; the app opens synth/index.html?embed=1 full-screen (see openSynth in js/app.js).
// Build it there first (npm run build). If any sample changed, bump SYNTH_CACHE in sw.js so phones fetch them again.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.resolve(process.argv[2] || path.join(root, '..', 'Chord-Synth'));
const dst = path.join(root, 'synth');
const need = (p) => { if (!fs.existsSync(p)) { console.error('missing ' + p); process.exit(1); } return p; };

fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(path.join(dst, 'app/samples'), { recursive: true });
fs.copyFileSync(need(path.join(src, 'HiChord.html')), path.join(dst, 'index.html'));
fs.copyFileSync(need(path.join(src, 'app/hichord.js')), path.join(dst, 'app/hichord.js'));
fs.copyFileSync(need(path.join(src, 'assets-src/ATTRIBUTION.md')), path.join(dst, 'ATTRIBUTION.md'));
const samples = fs.readdirSync(need(path.join(src, 'app/samples'))).filter((f) => f.endsWith('.js')).sort();
const hash = crypto.createHash('sha256');
let bytes = 0;
for (const f of samples) {
  const data = fs.readFileSync(path.join(src, 'app/samples', f));
  fs.writeFileSync(path.join(dst, 'app/samples', f), data);
  if (f !== 'manifest.js') { hash.update(f).update(data); bytes += data.length; }
}
fs.writeFileSync(path.join(dst, 'README.md'), `# Chord synth

An unofficial emulator of the HiChord pocket chord synthesizer (Pocket Audio), copied from the separate
Chord-Synth project by \`tools/sync-synth.mjs\`. Don't edit these files here: change Chord-Synth, rebuild it, sync again.

Samples are freely licensed (CC0, plus one CC BY 3.0 source that must keep its credit): see ATTRIBUTION.md.
`);
console.log(`synced ${samples.length} sample files (${(bytes / 1e6).toFixed(1)} MB) from ${src}`);
console.log(`sample set fingerprint ${hash.digest('hex').slice(0, 12)} (compare with the SYNTH_CACHE note in sw.js)`);
