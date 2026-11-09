// Draws a chorale as real notation on the staff canvas, scrolling past a play line while it plays.
// 'all': short score, the way hymnals print chorales (soprano and alto on the treble staff, tenor and
// bass on the bass staff, words between the staves). 'mine': only your part, larger, in your clef.
// Your part is bright and turns green/orange note by note as you sing; the others are grey. Your
// pitch is traced on your staff behind the play line. Before you start, drag sideways to read ahead.
//
// view: { chorale, part: 'S'|'A'|'T'|'B', mode: 'all'|'mine', fifths, T: (q) => warped beats (fermatas),
//         now: () => warped beats since the start, or null when not playing,
//         states: () => [script state per merged note of your part] | null, trail: [{ w, m }], pan }

import { GLYPHS, ENGRAVING } from './glyphs.js';
import { STAVES, keyAlterations, signatureLetters, ledgers, continuousPosition } from './notation.js';

const PATHS = {};
const gp = (n) => PATHS[n] || (PATHS[n] = new Path2D(GLYPHS[n].d));
const NOTE_W = GLYPHS.noteheadBlack.w;
const ACC = { '-2': 'accidentalFlat', '-1': 'accidentalFlat', 0: 'accidentalNatural', 1: 'accidentalSharp', 2: 'accidentalSharp' };
const C = {
  bg: '#0d1016', line: 'rgba(200,210,226,0.55)', ink: '#d7dde8', other: '#7d8699', mine: '#f4f7fc',
  current: '#64d2ff', good: '#30d158', off: '#ff8a4c', words: '#aeb7c7', head: 'rgba(100,210,255,0.55)',
};
const CLEF_OF = { S: 'treble', A: 'treble', T: 'treble8', B: 'bass' };

function glyph(g, name, x, y, sp, color) { g.save(); g.translate(x, y); g.scale(sp, sp); g.fillStyle = color; g.fill(gp(name)); g.restore(); }

/** Everything that doesn't change while it scrolls: staves, notes with their accidentals, beams, ties. */
function prepare(view) {
  const c = view.chorale, key = { fifths: c.fifths };
  const staves = view.mode === 'all'
    ? [{ id: 'treble', voices: ['S', 'A'] }, { id: 'bass', voices: ['T', 'B'] }]
    : [{ id: CLEF_OF[view.part], voices: [view.part] }];
  const bars = c.bars.slice(1); // bar lines (the first entry is the start of the first, maybe pickup, bar)
  const barOf = (q) => { let i = 0; while (i < bars.length && bars[i] <= q + 1e-6) i++; return i; };
  const sig = keyAlterations(key);
  // which merged note (script entry) each written note belongs to, for your part
  const merged = c.voices[view.part];
  const scriptIdx = (q) => merged.findIndex((n) => q >= n[0] - 1e-6 && q < n[0] + n[1] - 1e-6);
  const notes = [];
  staves.forEach((st, si) => {
    const all = [];
    st.voices.forEach((v, vi) => {
      const list = c.score[v];
      list.forEach((n, i) => {
        const [q, d, l, a, oct, tie, ferm] = n;
        const rest = l === -1;
        const prev = list[i - 1];
        all.push({ q, d, w: view.T(q), rest, l, a, dia: rest ? null : oct * 7 + l, tie: !!tie, ferm: !!ferm, voice: v, vi,
          up: view.mode === 'all' ? vi === 0 : null, si, mine: v === view.part,
          tieIn: !!(prev && prev[2] !== -1 && prev[5] && prev[2] === l && prev[4] === oct),
          script: v === view.part && !rest ? scriptIdx(q) : -1, bar: barOf(q) });
      });
    });
    all.sort((x, y) => x.q - y.q || x.vi - y.vi);
    // accidentals: per staff and bar, by staff position; a tied-over note doesn't repeat its accidental
    let bar = -1, state = null;
    for (const n of all) {
      if (n.bar !== bar) { bar = n.bar; state = new Map(); }
      if (n.rest) continue;
      const cur = state.has(n.dia) ? state.get(n.dia) : sig[n.l];
      n.acc = cur !== n.a && !n.tieIn ? n.a : null;
      state.set(n.dia, n.a);
      n.p = n.dia - STAVES[st.id].bottom;
      if (n.up === null) n.up = n.p < 4; // one part alone: stems by position
    }
    // two voices a step apart at the same moment: nudge the lower (stem-down) note to the right;
    // both voices resting together: one rest, in the middle of the staff
    for (let i = 1; i < all.length; i++) {
      const x = all[i - 1], y = all[i];
      if (x.rest && y.rest && Math.abs(x.q - y.q) < 1e-6 && Math.abs(x.d - y.d) < 1e-6) { x.shared = true; y.skip = true; }
      if (!x.rest && !y.rest && Math.abs(x.q - y.q) < 1e-6 && x.vi !== y.vi && Math.abs(x.dia - y.dia) === 1) (x.vi === 1 ? x : y).nudge = 1;
    }
    notes.push(...all);
  });
  // beams: consecutive notes shorter than a beat, same voice, same beat
  const groups = [];
  for (const v of ['S', 'A', 'T', 'B']) {
    let cur = [];
    const flush = () => { if (cur.length > 1) groups.push(cur); else if (cur.length === 1) cur[0].flag = true; cur = []; };
    for (const n of notes.filter((x) => x.voice === v)) {
      const short = !n.rest && n.d < 1 - 1e-6;
      const last = cur[cur.length - 1];
      if (short && last && Math.abs(last.q + last.d - n.q) < 1e-6 && Math.floor(last.q + 1e-6) === Math.floor(n.q + 1e-6)) cur.push(n);
      else { flush(); if (short) cur.push(n); }
    }
    flush();
  }
  for (const grp of groups) for (const n of grp) n.beam = grp;
  // ties: link to the next note of the same voice
  for (const v of ['S', 'A', 'T', 'B']) {
    const vs = notes.filter((x) => x.voice === v && !x.rest);
    vs.forEach((n, i) => { if (n.tie && vs[i + 1]) n.tieTo = vs[i + 1]; });
  }
  const words = (c.lyrics || []).map(([q, text, syl]) => ({ q, w: view.T(q), text, hyphen: syl === 'begin' || syl === 'middle' }));
  return { key, staves, bars, notes, groups, words, end: view.T(c.length), barsW: bars.map((b) => view.T(b)) };
}

export function drawScoreView(g, w, h, padTop, padBottom, view) {
  if (!view._prep) view._prep = prepare(view);
  const P = view._prep;
  const all = view.mode === 'all';
  const avail = Math.max(60, h - padTop - padBottom);
  // vertical room in staff spaces: above / staff / between / staff / below
  const rows = all ? 4.6 + 4 + 7.6 + 4 + 3.8 : 4.4 + 4 + 5;
  const sp = Math.max(5.5, Math.min(avail / rows, all ? 9.5 : 12.5));
  const top = padTop + Math.max(0, (avail - rows * sp) / 2) + (all ? 4.6 : 4.4) * sp;
  const st = P.staves.map((s, i) => ({ ...s, top: top + i * (4 + 7.6) * sp, bottom: top + i * (4 + 7.6) * sp + 4 * sp }));
  const yOf = (si, p) => st[si].bottom - p * sp / 2;
  const sigN = Math.abs(P.key.fifths);
  const left = sp * (all ? 1.5 : 0.6);
  const clefX = left + sp * 0.6;
  const sigX = clefX + GLYPHS.gClef.w * sp + sp * 0.5;
  const contentX = sigX + sigN * sp * 1.05 + sp * 0.6;
  const px = contentX + (w - contentX) * 0.28; // the play line
  const ppq = sp * (all ? 5.4 : 4.8), barGap = sp * 2.6;
  // horizontal position of a (warped) beat: proportional to time, plus room at each bar line
  const X = (wq) => {
    let x = wq * ppq;
    for (const b of P.barsW) { const r = (wq - (b - 0.25)) / 0.25; if (r <= 0) break; x += barGap * Math.min(1, r); }
    return x;
  };
  const now = view.now();
  const startPan = px - contentX - 5 * sp;
  view._panMin = startPan; view._panMax = Math.max(startPan, X(P.end) - (w - px) * 0.5);
  if (view.pan == null) view.pan = startPan;
  view._shiftOf = X;
  const shift = now != null ? X(now) : view.pan;
  const xOf = (wq) => px + X(wq) - shift;
  const states = view.states ? view.states() : null;
  const colorOf = (n) => {
    if (!n.mine) return C.other;
    const s = states && n.script >= 0 ? states[n.script] : null;
    return s && s.state === 'good' ? C.good : s && s.state === 'off' ? C.off : s && s.state === 'current' ? C.current : C.mine;
  };

  g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
  // staff lines
  const thick = Math.max(1, ENGRAVING.staffLine * sp);
  g.fillStyle = C.line;
  for (const s of st) for (let i = 0; i < 5; i++) g.fillRect(left, s.bottom - i * sp - thick / 2, w - left, thick);

  // ---------- the music (clipped to the right of the clefs) ----------
  g.save();
  g.beginPath(); g.rect(contentX - sp * 0.4, 0, w, h); g.clip();
  const lo = contentX - 8 * sp, hi = w + 3 * sp;
  // time signature at the start, bar lines, final double bar
  const ts = xOf(0) - 4.2 * sp;
  if (ts > lo && ts < hi) for (const [si] of st.entries()) {
    const mid = yOf(si, 4);
    glyph(g, 'timeSig' + view.chorale.time[0], ts, mid - sp, sp, C.ink);
    glyph(g, 'timeSig' + view.chorale.time[1], ts, mid + sp, sp, C.ink);
  }
  const barTop = st[0].top, barBottom = st[st.length - 1].bottom;
  g.fillStyle = C.line;
  for (const b of P.barsW) {
    const x = xOf(b) - 1.9 * sp;
    if (x > lo && x < hi) g.fillRect(x, barTop, Math.max(1, sp * 0.13), barBottom - barTop);
  }
  const xe = xOf(P.end) - ppq * 0.3;
  if (xe > lo && xe < hi) { g.fillRect(xe - sp * 0.7, barTop, Math.max(1, sp * 0.13), barBottom - barTop); g.fillRect(xe - sp * 0.2, barTop, sp * 0.5, barBottom - barTop); }

  // words, between the staves (or under your part): painted with a dark edge so stems pass behind them
  if (P.words.length) {
    const wy = all ? st[0].bottom + 3.9 * sp : st[0].bottom + 3.4 * sp;
    g.font = `${Math.round(Math.max(11, sp * (all ? 1.45 : 1.2)))}px -apple-system, system-ui, sans-serif`;
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    P.words.forEach((wd, i) => {
      const x = xOf(wd.w);
      if (x < lo || x > hi) return;
      g.lineWidth = sp * 0.5; g.strokeStyle = C.bg; g.strokeText(wd.text, x, wy);
      g.fillStyle = C.words; g.fillText(wd.text, x, wy);
      const next = P.words[i + 1];
      if (wd.hyphen && next) {
        const a = x + g.measureText(wd.text).width, b = xOf(next.w);
        if (b - a > sp * 1.2) g.fillRect((a + b) / 2 - sp * 0.3, wy, sp * 0.6, Math.max(1, sp * 0.12));
      }
    });
  }

  // your pitch, traced on your staff behind the play line
  const mySi = st.findIndex((s) => s.voices.includes(view.part));
  if (view.trail && view.trail.length > 1 && now != null) {
    g.lineWidth = Math.max(1.5, sp * 0.22); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = C.current; g.globalAlpha = 0.75;
    let open = false;
    for (const pt of view.trail) {
      if (pt.m == null) { if (open) g.stroke(); open = false; continue; }
      const x = xOf(pt.w), y = yOf(mySi, continuousPosition(st[mySi].id, pt.m));
      if (!open) { g.beginPath(); g.moveTo(x, y); open = true; } else g.lineTo(x, y);
    }
    if (open) g.stroke();
    g.globalAlpha = 1;
  }

  // notes: others first, then yours on top
  const lt = Math.max(1, ENGRAVING.ledger * sp), stemW = Math.max(1, ENGRAVING.stem * sp);
  const stemEnd = (n, y) => {
    const mid = yOf(n.si, 4);
    if (n.up) return all ? y - 3.5 * sp : Math.min(y - 3.5 * sp, mid);
    return all ? y + 3.5 * sp : Math.max(y + 3.5 * sp, mid);
  };
  const order = [...P.notes.filter((n) => !n.mine), ...P.notes.filter((n) => n.mine)];
  for (const n of order) {
    const x = xOf(n.w) + (n.nudge ? NOTE_W * sp : 0);
    if (x < lo || x > hi) continue;
    const color = colorOf(n);
    if (n.rest) {
      const name = n.d >= 4 ? 'restWhole' : n.d >= 2 ? 'restHalf' : n.d >= 1 ? 'restQuarter' : n.d >= 0.5 ? 'rest8th' : 'rest16th';
      if (n.skip) continue;
      const y = yOf(n.si, 4) + (all && !n.shared ? (n.vi === 0 ? -1.5 : 1.5) * sp : 0);
      glyph(g, name, x, name === 'restWhole' ? y - sp : y, sp, color);
      continue;
    }
    const y = yOf(n.si, n.p);
    g.fillStyle = C.line;
    for (const q of ledgers(n.p)) g.fillRect(x - ENGRAVING.ledgerExt * sp, yOf(n.si, q) - lt / 2, (NOTE_W + 2 * ENGRAVING.ledgerExt) * sp, lt);
    if (n.acc !== null && n.acc !== undefined) glyph(g, ACC[n.acc], x - (GLYPHS[ACC[n.acc]].w + 0.25) * sp, y, sp, color);
    const head = n.d >= 4 - 1e-6 ? 'noteheadWhole' : n.d >= 2 - 1e-6 ? 'noteheadHalf' : 'noteheadBlack';
    glyph(g, head, x, y, sp, color);
    if ([0.75, 1.5, 3].some((v) => Math.abs(n.d - v) < 1e-6)) {
      const onLine = n.p % 2 === 0;
      glyph(g, 'augmentationDot', x + (NOTE_W + 0.35) * sp, y + (onLine ? (n.up ? -0.5 : 0.5) * sp : 0), sp, color);
    }
    if (head !== 'noteheadWhole' && !n.beam) {
      const ye = stemEnd(n, y);
      g.fillStyle = color;
      if (n.up) g.fillRect(x + NOTE_W * sp - stemW, ye, stemW, y - ye - sp * 0.15);
      else g.fillRect(x, y + sp * 0.15, stemW, ye - y - sp * 0.15);
      if (n.flag) glyph(g, n.d <= 0.25 + 1e-6 ? (n.up ? 'flag16thUp' : 'flag16thDown') : (n.up ? 'flag8thUp' : 'flag8thDown'), n.up ? x + NOTE_W * sp - stemW : x, ye, sp, color);
    }
    if (n.ferm) {
      const fx = x + NOTE_W * sp / 2 - GLYPHS.fermataAbove.w * sp / 2;
      if (!all) glyph(g, 'fermataAbove', fx, Math.min(st[n.si].top, y - (n.up && head !== 'noteheadWhole' ? 3.9 : 0.8) * sp) - sp * 0.5, sp, color);
      // in the short score, as hymn books print them: over the soprano and under the bass
      else if (n.voice === 'S') glyph(g, 'fermataAbove', fx, Math.min(st[n.si].top, y - 3.9 * sp) - sp * 0.5, sp, color);
      else if (n.voice === 'B') glyph(g, 'fermataBelow', fx, Math.max(st[n.si].bottom, y + 3.9 * sp) + sp * 0.5, sp, color);
    }
  }
  // beams (drawn after the noteheads they join)
  for (const grp of P.groups) {
    for (const n of grp) { n._x = xOf(n.w) + (n.nudge ? NOTE_W * sp : 0); n._y = yOf(n.si, n.p); }
    if (grp[grp.length - 1]._x < lo || grp[0]._x > hi) continue;
    const up = grp[0].up, color = colorOf(grp[0]);
    const sx = (n) => (up ? n._x + NOTE_W * sp - stemW : n._x);
    const a = grp[0], z = grp[grp.length - 1];
    let ya = stemEnd(a, a._y), yz = stemEnd(z, z._y);
    yz = ya + Math.max(-sp, Math.min(sp, yz - ya)); // gentle slope
    const lineAt = (x) => ya + (yz - ya) * (x - sx(a)) / Math.max(1, sx(z) - sx(a));
    let fix = 0; // every note needs a stem at least 2.5 spaces long
    for (const n of grp) { const need = up ? n._y - 2.5 * sp : n._y + 2.5 * sp; const at = lineAt(sx(n)); fix = up ? Math.min(fix, need - at) : Math.max(fix, need - at); }
    ya += fix; yz += fix;
    const th = sp * 0.5;
    g.fillStyle = color;
    for (const n of grp) {
      const yb = lineAt(sx(n));
      if (up) g.fillRect(sx(n), yb, stemW, n._y - yb - sp * 0.15); else g.fillRect(sx(n), n._y + sp * 0.15, stemW, yb - n._y - sp * 0.15);
    }
    const beam = (x0, x1, off) => {
      g.beginPath();
      const y0 = lineAt(x0) + off, y1 = lineAt(x1) + off;
      if (up) { g.moveTo(x0, y0); g.lineTo(x1 + stemW, y1); g.lineTo(x1 + stemW, y1 + th); g.lineTo(x0, y0 + th); }
      else { g.moveTo(x0, y0 - th); g.lineTo(x1 + stemW, y1 - th); g.lineTo(x1 + stemW, y1); g.lineTo(x0, y0); }
      g.closePath(); g.fill();
    };
    beam(sx(a), sx(z), 0);
    const off2 = (up ? 1 : -1) * th * 1.6;
    grp.forEach((n, k) => { // second beam for sixteenths
      if (n.d > 0.25 + 1e-6) return;
      const nx = grp[k + 1], pv = grp[k - 1];
      if (nx && nx.d <= 0.25 + 1e-6) beam(sx(n), sx(nx), off2);
      else if (!(pv && pv.d <= 0.25 + 1e-6)) beam(nx ? sx(n) : sx(n) - sp * 1.1, nx ? sx(n) + sp * 1.1 : sx(n), off2);
    });
  }
  // ties, curving away from the stems
  g.lineWidth = Math.max(1, sp * 0.16);
  for (const n of P.notes) {
    if (!n.tieTo || n.rest) continue;
    const x0 = xOf(n.w) + (n.nudge ? NOTE_W * sp : 0) + NOTE_W * sp * 0.8, x1 = xOf(n.tieTo.w) + NOTE_W * sp * 0.2;
    if (x1 < lo || x0 > hi) continue;
    const y = yOf(n.si, n.p) + (n.up ? 0.7 : -0.7) * sp, bow = (n.up ? 1 : -1) * Math.min(1.4, 0.4 + (x1 - x0) / sp / 10) * sp;
    g.strokeStyle = colorOf(n);
    g.beginPath(); g.moveTo(x0, y); g.quadraticCurveTo((x0 + x1) / 2, y + bow, x1, y); g.stroke();
  }
  g.restore();

  // the play line
  if (now != null) { g.fillStyle = C.head; g.fillRect(px - 1, barTop - 3 * sp, 2, barBottom - barTop + 6 * sp); }

  // ---------- fixed at the left: system line, brace, clefs, key signatures ----------
  const grad = g.createLinearGradient(contentX - sp * 1.2, 0, contentX - sp * 0.2, 0);
  grad.addColorStop(0, C.bg); grad.addColorStop(1, 'rgba(13,16,22,0)');
  g.fillStyle = C.bg; g.fillRect(0, 0, contentX - sp * 1.2, h);
  g.fillStyle = grad; g.fillRect(contentX - sp * 1.2, 0, sp, h);
  g.fillStyle = C.line;
  for (const s of st) for (let i = 0; i < 5; i++) g.fillRect(left, s.bottom - i * sp - thick / 2, contentX - left, thick);
  if (all) {
    g.fillRect(left, barTop, Math.max(1, sp * 0.13), barBottom - barTop);
    g.save(); g.translate(left - sp * 1.1, barBottom); g.scale(sp * 2.2, (barBottom - barTop) / 4); g.fillStyle = C.ink; g.fill(gp('brace')); g.restore();
  }
  st.forEach((s, si) => {
    const S = STAVES[s.id];
    glyph(g, S.glyph, clefX, yOf(si, S.glyphAt), sp, C.ink);
    signatureLetters(P.key).forEach((acc, j) => {
      const p = (acc.a > 0 ? S.sig.sharp : S.sig.flat)[j];
      glyph(g, ACC[acc.a], sigX + j * sp * 1.05, yOf(si, p), sp, C.ink);
    });
  });
}
