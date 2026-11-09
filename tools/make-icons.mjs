// Renders the app icon: node tools/make-icons.mjs
// Drawn once at 1024 px, then scaled down with macOS `sips` (rendering tiny sizes directly in a
// headless browser produced a broken 180 px icon). Writes icons/icon-{180,192,512}.png and identical
// icon-v2-* copies. Never delete an icon name that has been published: saved pages may still use it.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Full-bleed square (iOS rounds the corners itself). Keep the key content inside the middle ~85%.
const keyW = 1024 / 5;                   // five big white keys: C D E F G
const keysTop = 606;
const lit = 3;                           // F, the key under the end of the pitch line
const pitchPath = 'M 104 470 C 224 470 252 338 374 332 S 500 302 540 270 q 29 -30 58 0 t 58 0 t 58 0';
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#202a47"/><stop offset="0.6" stop-color="#121725"/><stop offset="1" stop-color="#0b0d12"/>
    </linearGradient>
    <radialGradient id="halo" cx="714" cy="270" r="260" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#30d158" stop-opacity="0.28"/><stop offset="1" stop-color="#30d158" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="line" x1="104" y1="0" x2="714" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#5ac8fa"/><stop offset="1" stop-color="#34d65c"/>
    </linearGradient>
    <linearGradient id="white" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbfaf6"/><stop offset="1" stop-color="#e2dfd6"/>
    </linearGradient>
    <linearGradient id="green" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c9f8d4"/><stop offset="1" stop-color="#5fd681"/>
    </linearGradient>
    <linearGradient id="black" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a3e48"/><stop offset="1" stop-color="#121418"/>
    </linearGradient>
    <filter id="blur" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="20"/></filter>
  </defs>

  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="${keysTop}" fill="url(#halo)"/>
  <g fill="#ffffff" fill-opacity="0.07">
    <rect x="0" y="168" width="1024" height="4"/><rect x="0" y="300" width="1024" height="4"/><rect x="0" y="432" width="1024" height="4"/>
  </g>

  <!-- the voice: one soft glow underneath, one crisp line on top -->
  <path d="${pitchPath}" fill="none" stroke="url(#line)" stroke-width="62" stroke-linecap="round" stroke-linejoin="round" filter="url(#blur)" opacity="0.6"/>
  <path d="${pitchPath}" fill="none" stroke="url(#line)" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="714" cy="270" r="50" fill="#34d65c"/>
  <circle cx="714" cy="270" r="22" fill="#eafff0"/>

  <!-- the keyboard -->
  <rect x="0" y="${keysTop - 22}" width="1024" height="${1024 - keysTop + 22}" fill="#06070a"/>
  ${[0, 1, 2, 3, 4].map((i) => `<rect x="${(i * keyW + 6).toFixed(1)}" y="${keysTop}" width="${(keyW - 12).toFixed(1)}" height="${1024 - keysTop + 40}" rx="14" fill="url(#${i === lit ? 'green' : 'white'})"/>`).join('\n  ')}
  ${[1, 2, 4].map((i) => `<rect x="${(i * keyW - 62).toFixed(1)}" y="${keysTop - 4}" width="124" height="250" rx="12" fill="url(#black)"/>`).join('\n  ')}
  <rect x="0" y="${keysTop - 22}" width="1024" height="16" fill="#000000" fill-opacity="0.55"/>
</svg>`;

const tmp = fs.mkdtempSync(path.join(root, '.icon-'));
try {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#0b0d12;overflow:hidden">${svg}</body></html>`);
  const master = path.join(tmp, 'master.png');
  await page.screenshot({ path: master, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  await browser.close();
  for (const old of fs.readdirSync(path.join(root, 'icons'))) fs.unlinkSync(path.join(root, 'icons', old));
  for (const size of [180, 192, 512]) {
    const out = path.join(root, `icons/icon-${size}.png`);
    execFileSync('sips', ['-s', 'format', 'png', '-z', String(size), String(size), master, '--out', out], { stdio: 'ignore' });
    // same image under the v2 name too: a copy of the page saved on a phone may point at either name,
    // and an icon address that 404s makes iPhone show a plain letter instead
    fs.copyFileSync(out, path.join(root, `icons/icon-v2-${size}.png`));
  }
  console.log('icons written: ' + fs.readdirSync(path.join(root, 'icons')).join(', '));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
