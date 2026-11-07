// End-to-end check in real browser engines: node tools/check.mjs
//  1. WebKit (Safari's engine) at iPhone size: loads, decodes all piano samples, keys play, settings open.
//  2. Chrome with a fake microphone singing C4 D4 E4 F4 G4 with vibrato: readout, range and graph follow.
// Screenshots go to tests/out/. To check the published site instead of a local copy:
//   APP_URL=https://zacheld.github.io/pitch-piano/ node tools/check.mjs
import { webkit, chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'tests/out');
fs.mkdirSync(out, { recursive: true });
const PORT = 8137, APP = process.env.APP_URL || `http://localhost:${PORT}/`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const server = process.env.APP_URL ? null : spawn(process.execPath, [path.join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
console.log('Checking ' + APP);
const problems = [];
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) problems.push(msg); };

// ---------- the test singer ----------
function testVoice(file) {
  const sr = 48000, notes = [60, 62, 64, 65, 67], dur = 0.9, gap = 0.12;
  const n = Math.round(sr * notes.length * (dur + gap) + sr * 0.5);
  const x = new Float32Array(n);
  let i = Math.round(sr * 0.3);
  for (const m of notes) {
    const f0 = 440 * Math.pow(2, (m - 69) / 12);
    let ph = 0;
    for (let k = 0; k < sr * dur; k++, i++) {
      const t = k / sr, env = Math.min(1, t / 0.05, (dur - t) / 0.05);
      const f = f0 * Math.pow(2, (40 / 1200) * Math.sin(2 * Math.PI * 5.5 * t));
      ph += 2 * Math.PI * f / sr;
      let s = 0;
      for (let h = 1; h * f0 < 5000; h++) {
        const fh = h * f0;
        const formant = [[700, 110], [1220, 120], [2600, 160]].reduce((a, [c, bw]) => a + 1 / (1 + ((fh - c) / bw) ** 2), 0);
        s += (1 / h) * formant * Math.sin(h * ph);
      }
      x[i] = 0.25 * env * s;
    }
    i += Math.round(sr * gap);
  }
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let k = 0; k < n; k++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[k] * 32767))), 44 + k * 2);
  fs.writeFileSync(file, b);
}

try {
  // ---------- 1. WebKit, iPhone 15-sized ----------
  console.log('WebKit (Safari engine), iPhone-sized screen');
  const wk = await webkit.launch({ headless: true });
  const phone = { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };
  const ctxW = await wk.newContext(phone);
  const page = await ctxW.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => { localStorage.setItem('pitchpiano.tipDismissed', 'true'); });
  await page.goto(APP);
  await page.waitForFunction(() => window.__pp && window.__pp.piano.ready, null, { timeout: 30000 });
  const loaded = await page.evaluate(() => window.__pp.piano.samples.length);
  ok(loaded === 42, `all 42 piano samples decoded in WebKit (${loaded})`);
  const offsets = await page.evaluate(() => window.__pp.piano.samples.map((s) => s.offset));
  ok(Math.max(...offsets) < 0.06, `no long silence before notes (max lead-in ${(Math.max(...offsets) * 1000).toFixed(1)} ms)`);
  await page.screenshot({ path: path.join(out, 'phone-start.png') });

  // tap middle C, then slide across three keys
  const box = await page.locator('#kbd').boundingBox();
  const keyBox = await page.locator('.key[data-midi="60"]').boundingBox();
  await page.touchscreen.tap(keyBox.x + keyBox.width / 2, box.y + box.height - 20);
  await page.waitForTimeout(150);
  const t = await page.evaluate(() => ({ targets: window.__pp.graph.targets.map((x) => x.midi), state: window.__pp.ctx.state }));
  ok(t.targets.includes(60), `tapping C4 plays C4 and marks it on the graph (${t.targets.join(',')}; audio ${t.state})`);
  const blackBox = await page.locator('.key[data-midi="61"]').boundingBox();
  await page.touchscreen.tap(blackBox.x + blackBox.width / 2, box.y + 20);
  await page.waitForTimeout(100);
  const t2 = await page.evaluate(() => window.__pp.graph.targets.map((x) => x.midi));
  ok(t2.includes(61), 'tapping the top of a black key plays the black key (C♯4)');
  const style = await page.evaluate(() => ({ body: getComputedStyle(document.body).touchAction, sel: getComputedStyle(document.body).webkitUserSelect }));
  ok(style.body === 'none' && style.sel === 'none', `page can't be dragged or text-selected (touch-action ${style.body}, select ${style.sel})`);
  const scroll = await page.evaluate(() => [document.scrollingElement.scrollHeight, innerHeight]);
  ok(scroll[0] <= scroll[1], `nothing to scroll: page fits the screen (${scroll[0]} ≤ ${scroll[1]})`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, 'phone-keys.png') });

  // settings
  await page.locator('#setBtn').tap();
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(out, 'phone-settings.png') });
  const sc = await page.evaluate(() => { const b = document.getElementById('settingsBody'); b.scrollTop = 400; return [b.scrollTop, b.scrollHeight, b.clientHeight]; });
  ok(sc[0] > 0 && sc[1] > sc[2], `settings list scrolls inside its sheet (${sc[1]} px of content in ${sc[2]} px)`);
  await page.evaluate(() => { document.getElementById('settingsBody').scrollTop = 0; });
  await page.locator('.presets button', { hasText: '415' }).tap();
  const a4 = await page.evaluate(() => [window.__pp.S.a4, window.__pp.piano.a4, window.__pp.tracker.a4]);
  ok(a4.every((v) => v === 415), `A4 = 415 retunes note names and piano (${a4.join(', ')})`);
  await page.locator('.presets button', { hasText: '440' }).tap();
  await page.locator('#doneBtn').tap();
  await page.waitForTimeout(400);

  // landscape
  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'phone-landscape.png') });
  const land = await page.evaluate(() => [document.scrollingElement.scrollHeight, innerHeight, document.getElementById('graph').clientHeight]);
  ok(land[0] <= land[1] && land[2] > 80, `landscape fits with a usable graph (graph ${land[2]} px tall)`);
  ok(errors.length === 0, 'no errors in WebKit' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await wk.close();

  // ---------- 2. Chrome with a fake singing microphone ----------
  console.log('Chrome with a fake microphone singing C4 D4 E4 F4 G4 (with vibrato)');
  const wav = path.join(out, 'test-voice.wav');
  testVoice(wav);
  const ch = await chromium.launch({ executablePath: CHROME, headless: true, args: [
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`,
    '--autoplay-policy=no-user-gesture-required'] });
  const ctxC = await ch.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p2 = await ctxC.newPage();
  const errs2 = [];
  p2.on('pageerror', (e) => errs2.push(e.message));
  await p2.goto(APP);
  await p2.waitForFunction(() => window.__pp && window.__pp.piano.ready, null, { timeout: 30000 });
  // offline copy: the service worker should store the app and all 42 piano notes
  const cached = await p2.evaluate(async () => {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 20000))]);
    if (!reg) return { sw: false, n: 0, samples: 0 };
    for (let i = 0; i < 40; i++) {
      const keys = (await caches.keys());
      let urls = [];
      for (const k of keys) urls = urls.concat((await (await caches.open(k)).keys()).map((r) => r.url));
      const samples = urls.filter((u) => u.endsWith('.m4a')).length;
      if (samples >= 42) return { sw: true, n: urls.length, samples };
      await new Promise((r) => setTimeout(r, 500));
    }
    return { sw: true, n: -1, samples: -1 };
  });
  ok(cached.sw && cached.samples === 42, `offline copy saved (service worker ${cached.sw ? 'on' : 'off'}, ${cached.n} files, ${cached.samples} piano notes)`);
  await p2.locator('#startBtn').click();
  await p2.waitForFunction(() => window.__pp.listening, null, { timeout: 5000 });
  const seen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) { // the fake mic loops a ~5.6 s file; watch two passes
    const s = await p2.evaluate(() => window.__pp.shown);
    if (s !== null) seen.add(s);
    await p2.waitForTimeout(60);
  }
  await p2.screenshot({ path: path.join(out, 'phone-singing.png') });
  const r = await p2.evaluate(() => ({ range: window.__pp.range, pts: window.__pp.graph.points.filter((p) => p.m !== null).length }));
  const notes = [...seen].sort((a, b) => a - b);
  ok([60, 62, 64, 65, 67].every((n) => seen.has(n)), `readout showed each sung note (saw ${notes.join(', ')})`);
  ok(notes.every((n) => n >= 59 && n <= 68), 'no wrong-octave or stray notes in the readout');
  ok(r.range && r.range.lo === 60 && r.range.hi === 67, `range chip found C4–G4 (${r.range ? r.range.lo + '–' + r.range.hi : 'none'})`);
  ok(r.pts > 100, `graph drew the voice (${r.pts} points)`);
  await p2.locator('#pauseBtn').click();
  const n1 = await p2.evaluate(() => window.__pp.graph.points.length);
  await p2.waitForTimeout(500);
  const n2 = await p2.evaluate(() => window.__pp.graph.points.length);
  ok(n1 === n2, 'pause freezes the graph');
  await p2.screenshot({ path: path.join(out, 'phone-paused.png') });
  ok(errs2.length === 0, 'no errors in Chrome' + (errs2.length ? ': ' + errs2.join(' | ') : ''));
  await ch.close();
} finally {
  if (server) server.kill();
}
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nall checks passed');
process.exit(problems.length ? 1 : 0);
