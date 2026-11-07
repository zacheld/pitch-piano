// Renders the app icon (pitch line over piano keys) to PNGs: node tools/make-icons.mjs
import { chromium } from 'playwright-core';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Full-bleed square; iOS rounds the corners itself.
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b2338"/><stop offset="1" stop-color="#0b0d12"/>
    </linearGradient>
    <linearGradient id="ln" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#64d2ff"/><stop offset="1" stop-color="#30d158"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <g stroke="#ffffff" stroke-opacity="0.06" stroke-width="4">
    <line x1="0" y1="190" x2="1024" y2="190"/><line x1="0" y1="290" x2="1024" y2="290"/>
    <line x1="0" y1="390" x2="1024" y2="390"/><line x1="0" y1="490" x2="1024" y2="490"/>
  </g>
  <path id="p" d="M 90 470 C 190 470 220 330 330 330 S 440 330 470 300 S 540 230 600 250 S 660 290 700 250 S 760 200 810 230 S 880 260 940 220"
        fill="none" stroke="url(#ln)" stroke-width="54" stroke-linecap="round" filter="url(#glow)" opacity="0.7"/>
  <use href="#p" filter="none" opacity="1"/>
  <path d="M 90 470 C 190 470 220 330 330 330 S 440 330 470 300 S 540 230 600 250 S 660 290 700 250 S 760 200 810 230 S 880 260 940 220"
        fill="none" stroke="url(#ln)" stroke-width="44" stroke-linecap="round"/>
  <circle cx="940" cy="220" r="34" fill="#30d158"/>
  <g transform="translate(0 610)">
    <rect x="0" y="0" width="1024" height="414" fill="#0a0b0e"/>
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${12 + i * 143}" y="10" width="135" height="404" rx="18" fill="#f3f2ec"/>`).join('')}
    <rect x="${12 + 3 * 143}" y="10" width="135" height="404" rx="18" fill="#a9efb5"/>
    ${[1, 2, 4, 5, 6].map((i) => `<rect x="${12 + i * 143 - 47}" y="10" width="86" height="240" rx="12" fill="#17191e"/>`).join('')}
  </g>
</svg>`;

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:#0b0d12">${svg}</body></html>`);
  await page.screenshot({ path: path.join(root, `icons/icon-${size}.png`), clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
console.log('icons written');
