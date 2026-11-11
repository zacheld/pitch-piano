// Draws rhythms on the staff canvas: a one-line percussion staff per bar, with time signature,
// noteheads, stems, flags, beams, dots, ties, rests, triplet brackets, counting syllables under the
// notes, a playhead, and tap results (coloured dots, early/late in ms) above the notes.

import { GLYPHS } from './glyphs.js';
import { timeline, syllable, barQ } from './rhythm-core.js';

const PATHS = {};
const gp = (n) => PATHS[n] || (PATHS[n] = new Path2D(GLYPHS[n].d));
const C = { ink: '#e3e8f1', line: 'rgba(200,210,226,0.6)', label: '#8b95a8', good: '#30d158', near: '#ffd60a', off: '#ff8a4c', head: '#64d2ff', miss: '#ff6b5e' };

function glyph(g, name, x, y, sp, color) { g.save(); g.translate(x, y); g.scale(sp, sp); g.fillStyle = color; g.fill(gp(name)); g.restore(); }

/**
 * view: { rhythm, rows?: [rhythm, rhythm, …] (stacked options with letters), syllables: 'numbers'|'takadimi'|null,
 *         results: [ms|null per attack], playhead: () => q | null, tol: ms, timing: {…} }
 */
export function drawRhythmView(g, w, h, padTop, padBottom, view) {
  if (view.timing) return drawTiming(g, w, h, padTop, padBottom, view.timing);
  if (view.meter) return drawMeter(g, w, h, padTop, padBottom, view.meter);
  const rows = view.rows || (view.rhythm ? view.rhythm.bars.map((_, i) => ({ r: view.rhythm, bar: i })) : []);
  if (!rows.length) return;
  const items = view.rows ? view.rows.map((r, i) => ({ r, bar: 0, letter: 'ABC'[i] })) : rows;
  const avail = Math.max(40, h - padTop - padBottom);
  // Room one line of music needs, in staff spaces: above the line (stems, beams, the triplet 3, tap
  // results) and below it (counting syllables). Everything is sized so it all fits in the space between
  // the title bar and the panel, on any screen: on a short screen two bars share a line instead.
  const swing = items[0].r.swing ? 1.4 : 0;
  const above = view.results ? 6.8 : 5.2, below = view.syllables ? 3.4 : 2.4, gap = 0.6;
  const events = Math.max(1, ...items.map((it) => timeline(it.r).filter((e) => e.bar === it.bar).length));
  let best = null;
  for (let per = 1; per <= (view.rows ? 1 : Math.min(2, items.length)); per++) {
    const lines = Math.ceil(items.length / per);
    const spH = avail / (lines * (above + below + gap) + swing);
    const spW = (w - 28) / per / (events * 2 + 4.5);
    const sp = Math.min(13, spH, spW);
    if (!best || sp > best.sp + 0.5) best = { per, lines, sp };
  }
  const { per, lines } = best;
  const sp = Math.max(5, best.sp);
  const lineH = (above + below + gap) * sp;
  const top = padTop + Math.max(0, (avail - lineH * lines - swing * sp) / 2);
  const colW = (w - 28) / per;
  let attackIdx = 0;
  items.forEach((it, i) => {
    const line = Math.floor(i / per), col = i % per;
    const y = top + swing * sp + line * lineH + (gap / 2 + above) * sp;
    attackIdx = drawBar(g, w, y, sp, it.r, it.bar, { ...view, showMeter: i === 0 || !!view.rows, letter: it.letter,
      left: 14 + col * colW, right: 14 + (col + 1) * colW, attackStart: view.rows ? 0 : attackIdx });
  });
  if (swing) {
    g.fillStyle = C.near; g.font = `600 ${Math.max(11, sp * 1.1)}px -apple-system, system-ui, sans-serif`;
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('Swing: play eighths long–short', 14, top);
  }
}

function drawBar(g, w, y, sp, r, barIndex, view) {
  const left = view.left ?? 14, right = view.right ?? w - 14;
  let x0 = left + (view.letter ? sp * 2.4 : 0);
  if (view.letter) {
    g.fillStyle = C.label; g.font = `700 ${sp * 1.6}px -apple-system, system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(view.letter, left, y);
  }
  // time signature (top and bottom number)
  if (view.showMeter) {
    const tw = sp * 2.2;
    digits(g, String(r.num), x0, y - sp, sp); digits(g, String(r.den), x0, y + sp, sp);
    x0 += tw + sp * 0.8;
  }
  g.fillStyle = C.line;
  g.fillRect(x0 - sp * 0.4, y - 0.6, right - x0 + sp * 0.4, 1.2);
  g.fillRect(right - 1, y - sp * 1.6, 1.5, sp * 3.2); // barline
  view._lastLabelX = null;
  const tl = timeline(r).filter((e) => e.bar === barIndex);
  const bq = barQ(r);
  const startQ = barIndex * bq;
  // spacing: proportional, with a little minimum room per event
  const inner = right - x0 - sp * 1.6;
  const minW = sp * 1.6;
  const raw = tl.map((e) => Math.max(e.d / bq * inner, minW));
  const scale = inner / raw.reduce((a, b) => a + b, 0);
  let x = x0 + sp * 0.4;
  const pos = tl.map((e, i) => { const p = x; x += raw[i] * scale; return p; });
  const qToX = (q) => { // for the playhead
    for (let i = 0; i < tl.length; i++) { const e = tl[i]; if (q < e.q - startQ + e.d) return pos[i] + ((q - (e.q - startQ)) / e.d) * raw[i] * scale; }
    return right;
  };
  const stemH = sp * 3.4, nw = GLYPHS.noteheadBlack.w * sp;
  // note lengths, drawn on the line behind the notes: while tapping, a band follows each held finger; after,
  // each press-to-release is green (right length), orange (cut short or held into the rest) or grey (not
  // checked: a quick note straight into the next), with a tick where a checked note should have ended
  const band = (fromQ, toQ, color, alpha) => {
    const a = Math.max(fromQ, startQ), b = Math.min(toQ, startQ + bq);
    if (b <= a) return;
    const xa = qToX(a - startQ) + (a === fromQ ? nw / 2 : 0), xb = qToX(b - startQ) + (b === toQ ? nw / 2 : 0);
    g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(xa, y - sp * 0.28, Math.max(2, xb - xa), sp * 0.56); g.globalAlpha = 1;
  };
  for (const h of view.holds || []) {
    if (h.toQ == null) continue;
    band(h.fromQ, h.toQ, h.cls === 'ok' ? C.good : h.cls ? C.off : C.label, h.cls ? 0.6 : 0.35);
    if (h.cls && h.endQ > startQ + 1e-6 && h.endQ <= startQ + bq + 1e-6) {
      const ex = qToX(h.endQ - startQ) + (h.endQ < startQ + bq - 1e-6 ? nw / 2 : -2);
      g.fillStyle = C.label; g.fillRect(ex - 1, y - sp * 0.9, 2, sp * 1.8);
    }
  }
  if (view.live) for (const h of view.live()) band(h.fromQ, h.toQ, C.head, 0.55);
  for (const q of view.extras || []) { // taps that matched no note
    if (q < startQ - 1e-6 || q >= startQ + bq) continue;
    const ex = qToX(q - startQ) + nw / 2, ey = y - stemH - sp * 1.6, k = sp * 0.42;
    g.strokeStyle = C.off; g.lineWidth = Math.max(1.5, sp * 0.18);
    g.beginPath(); g.moveTo(ex - k, ey - k); g.lineTo(ex + k, ey + k); g.moveTo(ex + k, ey - k); g.lineTo(ex - k, ey + k); g.stroke();
  }
  const stems = [];
  let attackIdx = view.attackStart || 0;
  tl.forEach((e, i) => {
    const nx = pos[i];
    if (e.rest) { restGlyph(g, e.d, nx, y, sp); return; }
    const head = e.d >= 4 - 1e-6 ? 'noteheadWhole' : e.d >= 2 - 1e-6 ? 'noteheadHalf' : 'noteheadBlack';
    let color = C.ink;
    if (e.attack && view.results) {
      const off = view.results[attackIdx];
      color = off == null ? C.miss : Math.abs(off) <= view.tol ? C.good : Math.abs(off) <= view.tol * 2 ? C.near : C.off;
      const roomy = view._lastLabelX == null || nx - view._lastLabelX > sp * 3.4;
      resultMark(g, nx + nw / 2, y - stemH - sp * 1.6, off, sp, color, roomy);
      if (roomy) view._lastLabelX = nx;
    }
    glyph(g, head, nx, y, sp, color);
    const dotted = [1.5, 3, 0.75].some((v) => Math.abs(e.d - v) < 1e-6);
    if (dotted) glyph(g, 'augmentationDot', nx + nw + sp * 0.3, y - sp * 0.5, sp, color);
    if (head !== 'noteheadWhole') { g.fillStyle = color; g.fillRect(nx + nw - sp * 0.12, y - stemH, sp * 0.12, stemH - sp * 0.2); }
    const flags = e.trip ? 1 : e.d <= 0.25 + 1e-6 ? 2 : e.d <= 0.75 + 1e-6 && e.d < 1 - 1e-6 ? 1 : 0;
    stems.push({ i, x: nx + nw - sp * 0.06, flags, q: e.q - startQ, trip: e.trip, color });
    if (e.tie && i > 0) { // tie arc from the previous note
      const px = pos[i - 1] + nw / 2, cx = nx + nw / 2;
      g.strokeStyle = color; g.lineWidth = Math.max(1, sp * 0.14);
      g.beginPath(); g.moveTo(px + sp * 0.3, y + sp * 0.7); g.quadraticCurveTo((px + cx) / 2, y + sp * 1.6, cx - sp * 0.3, y + sp * 0.7); g.stroke();
    }
    if (view.syllables && e.attack) {
      g.fillStyle = C.label; g.font = `600 ${Math.max(10, sp * 1.05)}px -apple-system, system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText(syllable(e.q - startQ, r, view.syllables), nx + nw / 2, y + sp * 1.9);
    }
    if (e.attack) attackIdx++;
  });
  // beams: consecutive flagged notes in the same beat (triplets beam as a group of three)
  const beatOf = (q) => { let s = 0; for (let b = 0; b < r.beats.length; b++) { if (q < s + r.beats[b] - 1e-6) return b; s += r.beats[b]; } return r.beats.length - 1; };
  const groups = [];
  stems.forEach((s) => {
    if (!s.flags) return;
    const last = groups[groups.length - 1];
    const prev = last && last[last.length - 1];
    if (prev && prev.i === s.i - 1 && beatOf(prev.q) === beatOf(s.q)) last.push(s); else groups.push([s]);
  });
  for (const grp of groups) {
    if (grp.length === 1) { const s = grp[0]; glyph(g, s.flags === 2 ? 'flag16thUp' : 'flag8thUp', s.x - sp * 0.06, y - stemH, sp, s.color); continue; }
    const yb = y - stemH, th = sp * 0.5;
    g.fillStyle = grp[0].color;
    g.fillRect(grp[0].x - sp * 0.06, yb, grp[grp.length - 1].x - grp[0].x + sp * 0.12, th);
    grp.forEach((s, k) => { // second beam for sixteenths (stubs where a sixteenth sits next to an eighth)
      if (s.flags < 2) return;
      const n = grp[k + 1], p = grp[k - 1];
      if (n && n.flags === 2) g.fillRect(s.x - sp * 0.06, yb + th * 1.6, n.x - s.x + sp * 0.12, th);
      else if (!(p && p.flags === 2)) { const dir = n ? 1 : -1; g.fillRect(dir > 0 ? s.x : s.x - sp * 1.1, yb + th * 1.6, sp * 1.1, th); }
    });
    if (grp[0].trip) {
      const mid = (grp[0].x + grp[grp.length - 1].x) / 2;
      glyph(g, 'tuplet3', mid - GLYPHS.tuplet3.w * sp * 0.35, yb - sp * 0.5, sp * 0.7, C.label);
    }
  }
  // playhead
  if (view.playhead) {
    const q = view.playhead();
    if (q != null && q >= startQ && q < startQ + bq) {
      const px = qToX(q - startQ);
      g.fillStyle = C.head; g.globalAlpha = 0.7; g.fillRect(px, y - sp * 4.6, 2, sp * 7.2); g.globalAlpha = 1;
    }
  }
  return attackIdx;
}

function digits(g, s, x, y, sp) { let xx = x; for (const ch of s) { glyph(g, 'timeSig' + ch, xx, y, sp, C.ink); xx += GLYPHS['timeSig' + ch].w * sp * 0.9; } }

function restGlyph(g, d, x, y, sp) {
  const name = d >= 4 - 1e-6 ? 'restWhole' : d >= 2 - 1e-6 ? 'restHalf' : d >= 1 - 1e-6 ? 'restQuarter' : d >= 0.5 - 1e-6 ? 'rest8th' : 'rest16th';
  glyph(g, name, x, name === 'restWhole' ? y - sp : y, sp, C.ink);
  if ([1.5, 0.75].some((v) => Math.abs(d - v) < 1e-6)) glyph(g, 'augmentationDot', x + GLYPHS[name].w * sp + sp * 0.3, y - sp * 0.5, sp, C.ink);
}

function resultMark(g, cx, y, off, sp, color, label = true) {
  g.fillStyle = color;
  g.beginPath(); g.arc(cx, y, sp * 0.45, 0, Math.PI * 2); g.fill();
  if (!label) return;
  g.font = `600 ${Math.max(9, sp * 0.9)}px -apple-system, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.fillText(off == null ? 'miss' : (off > 0 ? '+' : '') + off, cx, y - sp * 0.6);
}

/** Vowel-on-the-beat results: one row of dots, each beat's vowel start relative to the click. */
function drawTiming(g, w, h, padTop, padBottom, t) {
  const avail = h - padTop - padBottom, cy = padTop + avail / 2;
  const left = 30, right = w - 30, mid = (left + right) / 2, range = t.range || 200; // ms either side
  const xOf = (ms) => mid + (Math.max(-range, Math.min(range, ms)) / range) * (right - left) / 2;
  g.fillStyle = 'rgba(200,210,226,0.25)';
  g.fillRect(left, cy - 0.5, right - left, 1);
  g.fillStyle = C.good; g.globalAlpha = 0.18; g.fillRect(xOf(-t.tol), cy - 40, xOf(t.tol) - xOf(-t.tol), 80); g.globalAlpha = 1;
  g.fillStyle = C.ink; g.fillRect(mid - 1, cy - 46, 2, 92);
  g.font = '600 12px -apple-system, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = C.label;
  g.fillText('early', left + 24, cy + 50); g.fillText('on the beat', mid, cy + 50); g.fillText('late', right - 24, cy + 50);
  (t.offsets || []).forEach((ms, i) => {
    if (ms == null) return;
    const color = Math.abs(ms) <= t.tol ? C.good : Math.abs(ms) <= t.tol * 2 ? C.near : C.off;
    g.fillStyle = color;
    g.beginPath(); g.arc(xOf(ms), cy - 26 + (i % 6) * 10, 6, 0, Math.PI * 2); g.fill();
  });
  if (t.beat != null) { // the beat counter during a run
    g.fillStyle = C.head; g.font = `800 ${Math.min(64, avail / 4)}px -apple-system, system-ui, sans-serif`; g.textBaseline = 'middle';
    g.fillText(String(t.beat), mid, padTop + avail * 0.2);
  }
}

/** Tuning lab meter: −50…+50 cents around the piano's (equal-tempered) pitch, with the pure target marked. */
function drawMeter(g, w, h, padTop, padBottom, m) {
  const avail = h - padTop - padBottom, cy = padTop + avail / 2;
  const left = 28, right = w - 28, mid = (left + right) / 2, half = (right - left) / 2;
  const xOf = (c) => mid + Math.max(-50, Math.min(50, c)) / 50 * half;
  g.fillStyle = 'rgba(200,210,226,0.2)'; g.fillRect(left, cy - 1, right - left, 2);
  for (let c = -50; c <= 50; c += 10) { g.fillRect(xOf(c) - 0.5, cy - (c % 50 ? 6 : 10), 1, c % 50 ? 12 : 20); }
  g.font = '600 12px -apple-system, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
  g.fillStyle = C.label; g.fillText('piano', mid, cy + 30); g.fillRect(mid - 1, cy - 26, 2, 52);
  g.fillStyle = C.good; g.fillRect(xOf(m.pure) - 2, cy - 34, 4, 68); g.fillText('pure', xOf(m.pure), cy + 42);
  g.fillStyle = C.label; g.fillText('−50¢', left, cy + 14); g.fillText('+50¢', right, cy + 14);
  if (m.cents != null) {
    const near = Math.abs(m.cents - m.pure);
    g.fillStyle = near <= 5 ? C.good : near <= 15 ? C.near : C.off;
    g.beginPath(); g.arc(xOf(m.cents), cy, 11, 0, Math.PI * 2); g.fill();
    g.font = '700 16px -apple-system, system-ui, sans-serif'; g.textBaseline = 'bottom';
    g.fillText((m.cents > 0 ? '+' : '') + Math.round(m.cents) + '¢', xOf(m.cents), cy - 40);
  }
  if (m.label) { g.fillStyle = C.ink; g.font = `700 ${Math.min(22, avail / 10)}px -apple-system, system-ui, sans-serif`; g.textBaseline = 'middle'; g.fillText(m.label, mid, padTop + avail * 0.18); }
}
