// Renders the app icon: node tools/make-icons.mjs
// Drawn once at 1024 px, then scaled down with macOS `sips` (rendering tiny sizes directly in a
// headless browser produced a broken 180 px icon).
// Writes icons/icon-v3-{180,192,512}.png (what the page uses) plus identical copies under every
// name published before (icon-*, icon-v2-*). Never delete a published icon name: a copy of the page
// saved on a phone may still point at it, and a missing icon makes iPhone draw a plain letter.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const NAMES = ['icon-v3', 'icon', 'icon-v2'];

// Minimal: flat background, one voice line centred in the top half, a full octave of keys (C to C)
// running to the bottom edge. Full-bleed square; iOS rounds the corners itself.
const keysTop = 524, keyW = 1024 / 8;
const line = 'M 196 300 C 300 300 330 210 430 210 C 520 210 540 290 620 290 C 700 290 720 220 828 220';
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#111726"/>
  <path d="${line}" fill="none" stroke="#5ac8fa" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/>
  ${Array.from({ length: 8 }, (_, i) => `<rect x="${i * keyW + 4}" y="${keysTop}" width="${keyW - 8}" height="${1024 - keysTop}" fill="#f4f3ee"/>`).join('\n  ')}
  ${[1, 2, 4, 5, 6].map((i) => `<rect x="${i * keyW - 38}" y="${keysTop}" width="76" height="292" rx="10" fill="#111726"/>`).join('\n  ')}
</svg>`;

const tmp = fs.mkdtempSync(path.join(root, '.icon-'));
try {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#111726;overflow:hidden">${svg}</body></html>`);
  const master = path.join(tmp, 'master.png');
  await page.screenshot({ path: master, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  await browser.close();
  for (const size of [180, 192, 512]) {
    const first = path.join(root, `icons/${NAMES[0]}-${size}.png`);
    execFileSync('sips', ['-s', 'format', 'png', '-z', String(size), String(size), master, '--out', first], { stdio: 'ignore' });
    for (const n of NAMES.slice(1)) fs.copyFileSync(first, path.join(root, `icons/${n}-${size}.png`));
  }
  console.log('icons written: ' + fs.readdirSync(path.join(root, 'icons')).sort().join(', '));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
