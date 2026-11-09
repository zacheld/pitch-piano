// Builds data/chorales.json from Bach four-part chorales in the music21 corpus (public-domain music;
// encodings distributed with music21, github.com/cuthbertLab/music21). macOS: uses `unzip`.
// Usage: node tools/make-chorales.mjs <download-dir> [max]
// Keeps 4-part chorales in 3/4 or 4/4 whose tenor stays within C3–A4 and that run at most 72 beats.
// Per chorale: voices (tied notes merged, for playback and scoring) and, for the score view, the notes
// as written (score: [q, dur, letter 0–6, alter, octave, tied-to-next, fermata], rests as [q, dur, -1]),
// bar starts (bars, a pickup bar first if there is one) and the words under the soprano (lyrics: [q, text, syllabic]).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [dir, maxArg] = process.argv.slice(2);
if (!dir) { console.error('usage: node tools/make-chorales.mjs <download-dir> [max]'); process.exit(1); }
const MAX = +(maxArg || 24);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(dir, { recursive: true });
const API = 'https://api.github.com/repos/cuthbertLab/music21/contents/music21/corpus/bach';
const RAW = 'https://raw.githubusercontent.com/cuthbertLab/music21/master/music21/corpus/bach/';
const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const tag = (s, t) => { const m = new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(s); return m ? m[1] : null; };

function parse(xml) {
  const parts = [...xml.matchAll(/<part id="([^"]+)">([\s\S]*?)<\/part>/g)];
  const names = Object.fromEntries([...xml.matchAll(/<score-part id="([^"]+)">[\s\S]*?<part-name>([^<]*)<\/part-name>/g)].map((m) => [m[1], m[2].trim()]));
  let fifths = 0, mode = 'major', beats = 4, beatType = 4;
  const voices = {}, score = {}, bars = [], lyrics = [];
  for (const [pi, [, id, body]] of parts.entries()) {
    let divisions = 1, q = 0;
    const notes = [], written = [];
    for (const [, mbody] of body.matchAll(/<measure[^>]*>([\s\S]*?)<\/measure>/g)) {
      if (pi === 0) bars.push(+q.toFixed(4));
      for (const tok of mbody.matchAll(/<attributes>([\s\S]*?)<\/attributes>|<(note|backup|forward)\b[^>]*>([\s\S]*?)<\/\2>/g)) {
        if (tok[1] !== undefined) {
          const a = tok[1];
          if (tag(a, 'divisions')) divisions = +tag(a, 'divisions');
          if (tag(a, 'fifths') !== null) fifths = +tag(a, 'fifths');
          if (tag(a, 'mode')) mode = tag(a, 'mode').trim();
          if (tag(a, 'beats')) { beats = +tag(a, 'beats'); beatType = +tag(a, 'beat-type'); }
          continue;
        }
        const kind = tok[2], n = tok[3];
        const dur = +(tag(n, 'duration') || 0) / divisions;
        if (kind === 'backup') { q -= dur; continue; }
        if (kind === 'forward') { q += dur; continue; }
        if (/<chord\s*\/>/.test(n) || /<grace/.test(n)) continue;
        const rest = /<rest/.test(n);
        let midi = null;
        const tieStop = /<tie type="stop"/.test(n), fermata = /<fermata/.test(n);
        if (!rest) {
          const p = tag(n, 'pitch');
          const step = tag(p, 'step').trim(), alter = +(tag(p, 'alter') || 0), octave = +tag(p, 'octave');
          midi = 12 * (octave + 1) + STEP[step] + alter;
          written.push([+q.toFixed(4), +dur.toFixed(4), 'CDEFGAB'.indexOf(step), alter, octave, /<tie type="start"/.test(n) ? 1 : 0, fermata ? 1 : 0]);
          const lyr = /<lyric\b[^>]*>([\s\S]*?)<\/lyric>/.exec(n);
          if (pi === 0 && lyr && tag(lyr[1], 'text')) lyrics.push([+q.toFixed(4), tag(lyr[1], 'text').trim(), (tag(lyr[1], 'syllabic') || 'single').trim()]);
        } else written.push([+q.toFixed(4), +dur.toFixed(4), -1]);
        const last = notes[notes.length - 1];
        if (tieStop && last && last[2] === midi) { last[1] += dur; if (fermata) last[3] = 1; }
        else notes.push([+q.toFixed(4), +dur.toFixed(4), midi, fermata ? 1 : 0]);
        q += dur;
      }
    }
    const name = (names[id] || '').toLowerCase();
    const key = name.startsWith('sop') ? 'S' : name.startsWith('alt') ? 'A' : name.startsWith('ten') ? 'T' : name.startsWith('bas') ? 'B' : null;
    if (key) { voices[key] = notes.filter((x) => x[2] !== null); score[key] = written; }
  }
  return { fifths, mode, time: [beats, beatType], voices, score, bars, lyrics };
}

const list = JSON.parse(execFileSync('gh', ['api', API, '--jq', '[.[].name | select(test("^bwv[0-9.]+\\\\.mxl$"))]']).toString());
const out = [];
for (const name of list) {
  if (out.length >= MAX) break;
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) {
    const res = await fetch(RAW + name);
    if (!res.ok) continue;
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const xdir = path.join(dir, name.replace('.mxl', ''));
  fs.mkdirSync(xdir, { recursive: true });
  execFileSync('unzip', ['-o', '-q', file, '-d', xdir]);
  const xmlFile = fs.readdirSync(xdir).find((f) => f.endsWith('.xml') || f.endsWith('.musicxml'));
  if (!xmlFile) continue;
  const c = parse(fs.readFileSync(path.join(xdir, xmlFile), 'utf8'));
  const v = c.voices;
  if (!v.S || !v.A || !v.T || !v.B) continue;
  if (![3, 4].includes(c.time[0]) || c.time[1] !== 4) continue;
  const end = Math.max(...Object.values(v).map((ns) => ns[ns.length - 1][0] + ns[ns.length - 1][1]));
  const tenor = v.T.map((x) => x[2]);
  if (end > 72 || Math.min(...tenor) < 48 || Math.max(...tenor) > 69) continue;
  const bwv = name.replace('bwv', '').replace('.mxl', '');
  out.push({ id: 'bwv' + bwv, bwv, fifths: c.fifths, mode: c.mode, time: c.time, length: end, voices: v, score: c.score, bars: c.bars.filter((b) => b < end - 1e-6), lyrics: c.lyrics });
  console.log(`BWV ${bwv}: ${c.time.join('/')}, ${c.fifths} fifths ${c.mode}, ${end} beats, tenor ${Math.min(...tenor)}–${Math.max(...tenor)}`);
}
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data/chorales.json'), JSON.stringify(out));
console.log(`${out.length} chorales → data/chorales.json (${(fs.statSync(path.join(root, 'data/chorales.json')).size / 1024).toFixed(0)} KB)`);
