// The staff view: real engraved clefs, key signatures, ledger lines and accidentals.
// Free mode: what you sing (and play) is written down note by note, with the note you're singing now
// at the right end (plus an optional short pitch line). Exercise mode: the exercise's notes in fixed
// columns with their state (to sing, current, right, wrong, hidden, given).

import { GLYPHS, ENGRAVING } from './glyphs.js';
import { CLEF_VIEWS, STAVES, spell, positionOn, ledgers, stavesFor, accidentalShown, signatureLetters,
  continuousPosition, noteText, noteName, solfege } from './notation.js';

const PATHS = {};
const glyphPath = (name) => PATHS[name] || (PATHS[name] = new Path2D(GLYPHS[name].d));
const ACC_GLYPH = { '-1': 'accidentalFlat', 0: 'accidentalNatural', 1: 'accidentalSharp' };
const NOTE_W = GLYPHS.noteheadBlack.w;

export const STAFF_COLORS = {
  ink: '#d7dde8', line: 'rgba(200,210,226,0.55)', note: '#eef2f8', given: '#9aa6bb', current: '#64d2ff',
  good: '#30d158', near: '#ffd60a', off: '#ff8a4c', piano: '#bf8cff', hidden: 'rgba(200,210,226,0.35)',
  label: '#8b95a8',
};

export class StaffView {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.view = 'tenor'; this.key = null; this.flats = false; this.labels = 'names'; this.pitchLine = true;
    this.padTop = 0; this.padBottom = 0;
    this.written = [];        // free mode: [{ notes: [{ midi, source }], cls, t }]
    this.live = null;         // { midi, cls }
    this.line = [];           // recent pitch line [{ t, m, cls }]
    this.shift = 0;           // slide animation when a note is written
    this.exercise = null;     // { items: [...] }
    this.dirty = true;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.w = this.c.clientWidth; this.h = this.c.clientHeight; this.dpr = dpr;
    this.c.width = Math.max(1, Math.round(this.w * dpr)); this.c.height = Math.max(1, Math.round(this.h * dpr));
    this.dirty = true;
  }

  configure({ view, key, flats, labels, pitchLine }) {
    Object.assign(this, { view, key, flats, labels, pitchLine });
    this.dirty = true;
  }

  // ---------- free mode ----------
  /** A new note to write down. Piano notes pressed together (within 80 ms) share one column, as a chord. */
  write(midi, source, cls, t) {
    const last = this.written[this.written.length - 1];
    if (last && source === 'piano' && last.source === 'piano' && t - last.t < 0.08) {
      if (!last.notes.some((n) => n.midi === midi)) last.notes.push({ midi });
    } else {
      this.written.push({ notes: [{ midi }], source, cls, t });
      if (this.written.length > 60) this.written.shift();
      this.shift = 1;
    }
    this.dirty = true;
  }
  /** Update the colour (accuracy) of the newest sung note while it's still being held. */
  updateLast(cls) {
    const last = this.written[this.written.length - 1];
    if (last && last.source === 'voice' && last.cls !== cls) { last.cls = cls; this.dirty = true; }
  }
  setLive(midi, cls) {
    const same = (this.live && this.live.midi) === midi && (this.live && this.live.cls) === cls;
    if (same || (!this.live && midi == null)) return;
    this.live = midi == null ? null : { midi, cls };
    this.dirty = true;
  }
  addLine(t, m, cls) {
    if (m == null) { if (this.line.length && this.line[this.line.length - 1].m !== null) this.line.push({ t, m: null }); }
    else this.line.push({ t, m, cls });
    while (this.line.length && t - this.line[0].t > 2) this.line.shift();
    this.dirty = true;
  }
  clear() { this.written = []; this.live = null; this.line = []; this.dirty = true; }

  // ---------- exercise mode ----------
  /** items: [{ midi, state, label, sung: [{ midi, cls }] }]; state: pending|current|good|near|off|hidden|given|piano */
  setExercise(ex) { this.exercise = ex; this.dirty = true; }
  get k() { return this.exercise && this.exercise.key !== undefined ? this.exercise.key : this.key; }

  // ---------- layout ----------
  layout() {
    const v = CLEF_VIEWS[this.view] || CLEF_VIEWS.tenor;
    const n = v.staves.length;
    const avail = this.h - this.padTop - this.padBottom;
    const both = v.route === 'both';
    const rows = n === 1 ? 12.5 : both ? 23 : 21; // staff spaces needed top to bottom, with ledger room and labels
    const sigN = this.k && !this.k.none ? Math.abs(this.k.fifths) : 0;
    const across = 8 + sigN + (this.exercise ? Math.max(4, this.exercise.items.length) * 3 : 14);
    const sp = Math.max(7, Math.min(avail / rows, this.w / across, 22));
    const staffH = 4 * sp, gap = n === 1 ? 0 : (both ? 7.5 : 5.5) * sp;
    const blockH = n * staffH + gap;
    const top = this.padTop + (avail - blockH) / 2 - (this.labels !== 'none' ? 0.6 * sp : 0);
    const staves = v.staves.map((id, i) => ({ id, top: top + i * (staffH + gap), bottom: top + i * (staffH + gap) + staffH }));
    const left = sp * (v.brace ? 1.4 : 0.6);
    const clefX = left + sp * 0.7;
    const sigX = clefX + GLYPHS.gClef.w * sp + sp * 0.6;
    const contentX = sigX + sigN * sp * 1.05 + sp * 0.9;
    const labelY = staves[n - 1].bottom + sp * 3.1;
    return { v, sp, staves, left, clefX, sigX, contentX, labelY, sigN };
  }

  yOf(L, staffIdx, p) { return L.staves[staffIdx].bottom - p * L.sp / 2; }

  // ---------- drawing ----------
  active() { return this.dirty || this.shift > 0.001; }

  draw(now, dt = 0) {
    const g = this.g, { w, h, dpr } = this;
    if (!w || !h) return;
    this.dirty = false;
    this.shift = Math.max(0, this.shift - dt / 0.18);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0d1016';
    g.fillRect(0, 0, w, h);
    const L = this.layout();
    this.drawStaves(L);
    if (this.exercise) this.drawExercise(L);
    else this.drawFree(L, now);
  }

  drawStaves(L) {
    const g = this.g, { sp } = L;
    g.fillStyle = STAFF_COLORS.line;
    const thick = Math.max(1, ENGRAVING.staffLine * sp);
    for (const s of L.staves) for (let i = 0; i < 5; i++) g.fillRect(L.left, s.bottom - i * sp - thick / 2, this.w - L.left - sp * 0.4, thick);
    if (L.staves.length > 1) {
      g.fillRect(L.left, L.staves[0].top - thick / 2, Math.max(1, sp * 0.12), L.staves[L.staves.length - 1].bottom - L.staves[0].top + thick);
      if (L.v.brace) {
        const span = L.staves[L.staves.length - 1].bottom - L.staves[0].top;
        g.save(); g.translate(L.left - sp * 0.95, L.staves[L.staves.length - 1].bottom); g.scale(sp * 2.2, span / 4);
        g.fillStyle = STAFF_COLORS.ink; g.fill(glyphPath('brace')); g.restore();
      }
    }
    // clefs and key signatures
    L.staves.forEach((s, i) => {
      const st = STAVES[s.id];
      this.glyph(st.glyph, L.clefX, this.yOf(L, i, st.glyphAt), sp, STAFF_COLORS.ink);
      if (this.k && !this.k.none) {
        signatureLetters(this.k).forEach((acc, j) => {
          const p = (acc.a > 0 ? st.sig.sharp : st.sig.flat)[j];
          this.glyph(ACC_GLYPH[acc.a], L.sigX + j * sp * 1.05, this.yOf(L, i, p), sp, STAFF_COLORS.ink);
        });
      }
    });
  }

  glyph(name, x, y, sp, color) {
    const g = this.g;
    g.save(); g.translate(x, y); g.scale(sp, sp); g.fillStyle = color; g.fill(glyphPath(name)); g.restore();
  }

  /** One note at x on every staff it belongs to (two in the "both" view), with ledgers and accidental. */
  note(L, x, midi, color, { hollow = false, label = null, accidentals = true } = {}) {
    const n = spell(midi, this.k, this.flats);
    const idxs = stavesFor(this.view, midi);
    const ys = [];
    for (const i of idxs) {
      const st = L.staves[i];
      const p = positionOn(st.id, n);
      const y = this.yOf(L, i, p);
      ys.push(y);
      this.g.fillStyle = STAFF_COLORS.line;
      const lt = Math.max(1, ENGRAVING.ledger * L.sp);
      for (const q of ledgers(p)) {
        const yq = this.yOf(L, i, q);
        this.g.fillRect(x - ENGRAVING.ledgerExt * L.sp, yq - lt / 2, (NOTE_W + 2 * ENGRAVING.ledgerExt) * L.sp, lt);
      }
      const acc = accidentals ? accidentalShown(n, this.k && !this.k.none ? this.k : null) : null;
      if (acc !== null && acc !== undefined && ACC_GLYPH[acc]) {
        this.glyph(ACC_GLYPH[acc], x - (GLYPHS[ACC_GLYPH[acc]].w + 0.22) * L.sp, y, L.sp, color);
      }
      this.glyph(hollow ? 'noteheadHalf' : 'noteheadBlack', x, y, L.sp, color);
    }
    if (label) this.label(L, x, label, color);
    return n;
  }

  label(L, x, text, color = STAFF_COLORS.label) {
    const g = this.g;
    g.font = `600 ${Math.max(10, Math.min(14, L.sp * 0.85))}px -apple-system, system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(text, x + NOTE_W * L.sp / 2, L.labelY);
  }

  nameFor(midi) {
    if (this.labels === 'none') return null;
    if (this.labels === 'solfege' && this.key && !this.key.none) return solfege(midi, this.key);
    return noteName(spell(midi, this.key, this.flats));
  }

  drawFree(L, now) {
    const { sp } = L, g = this.g;
    const slot = sp * 3.2;
    const liveX = this.w - sp * 3.2;
    // short pitch line leading into the live note
    if (this.pitchLine && this.line.length > 1) {
      const span = sp * 7, x0 = liveX - span;
      const staffIdx = this.live ? stavesFor(this.view, this.live.midi) : stavesFor(this.view, Math.round(this.line[this.line.length - 1].m || 60));
      for (const si of staffIdx) {
        g.lineWidth = Math.max(1.5, sp * 0.16); g.lineCap = 'round'; g.lineJoin = 'round';
        let open = false;
        for (const pt of this.line) {
          if (pt.m === null) { if (open) g.stroke(); open = false; continue; }
          const x = x0 + span * (1 - Math.min(1, (now - pt.t) / 2)) + NOTE_W * sp / 2;
          const y = this.yOf(L, si, continuousPosition(L.staves[si].id, pt.m));
          if (!open) { g.strokeStyle = STAFF_COLORS[pt.cls] || STAFF_COLORS.current; g.globalAlpha = 0.45; g.beginPath(); g.moveTo(x, y); open = true; } else g.lineTo(x, y);
        }
        if (open) g.stroke();
        g.globalAlpha = 1;
      }
    }
    // notes written so far, newest next to the live note
    const offset = this.shift * slot;
    for (let i = this.written.length - 1, k = 1; i >= 0; i--, k++) {
      const col = this.written[i];
      const x = liveX - k * slot + offset;
      if (x < L.contentX - sp * 0.5) break;
      const color = col.source === 'piano' ? STAFF_COLORS.piano : (STAFF_COLORS[col.cls] || STAFF_COLORS.note);
      const ps = col.notes.map((n) => n.midi).sort((a, b) => a - b);
      ps.forEach((midi, j) => {
        const second = j > 0 && Math.abs(spell(midi, this.key, this.flats).dia - spell(ps[j - 1], this.key, this.flats).dia) === 1;
        this.note(L, x + (second ? NOTE_W * sp * 0.95 : 0), midi, color, { label: j === 0 ? this.nameFor(midi) : null });
      });
    }
    // the note being sung right now
    if (this.live) {
      const color = STAFF_COLORS[this.live.cls] || STAFF_COLORS.current;
      g.globalAlpha = 0.95;
      this.note(L, liveX, this.live.midi, color, { label: this.nameFor(this.live.midi) });
      g.globalAlpha = 1;
    }
  }

  /** ▲ above the staff (go higher), ▼ below it (go lower), ✓ when you're on it. */
  arrow(L, x, dir) {
    const g = this.g, sp = L.sp, cx = x + NOTE_W * sp / 2;
    const top = L.staves[0].top, bottom = L.staves[L.staves.length - 1].bottom;
    g.fillStyle = dir === 'ok' ? STAFF_COLORS.good : STAFF_COLORS.near;
    g.beginPath();
    if (dir === 'up') { const y = top - 3.2 * sp; g.moveTo(cx, y); g.lineTo(cx - sp * 0.9, y + sp * 1.3); g.lineTo(cx + sp * 0.9, y + sp * 1.3); }
    else if (dir === 'down') { const y = bottom + 3.2 * sp; g.moveTo(cx, y); g.lineTo(cx - sp * 0.9, y - sp * 1.3); g.lineTo(cx + sp * 0.9, y - sp * 1.3); }
    else { g.font = `800 ${sp * 1.5}px -apple-system, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✓', cx, top - 2.6 * sp); return; }
    g.closePath(); g.fill();
  }

  drawExercise(L) {
    const { sp } = L, g = this.g, items = this.exercise.items;
    const n = Math.max(1, items.length);
    const room = this.w - L.contentX - sp * 1.2;
    const slot = Math.min(sp * 4.2, room / n);
    const x0 = L.contentX + Math.max(0, (room - slot * n) / 2) + (slot - NOTE_W * sp) / 2;
    items.forEach((it, i) => {
      const x = x0 + i * slot;
      if (it.state === 'current') {
        g.fillStyle = 'rgba(100,210,255,0.13)';
        g.fillRect(x - slot * 0.32, L.staves[0].top - sp * 2.5, NOTE_W * sp + slot * 0.64, L.staves[L.staves.length - 1].bottom - L.staves[0].top + sp * 5);
      }
      if (it.arrow) this.arrow(L, x, it.arrow);
      if (it.state === 'hidden') {
        // nothing to show yet (an empty column)
      } else if (it.midi != null || it.notes) {
        const color = { pending: STAFF_COLORS.note, current: STAFF_COLORS.current, good: STAFF_COLORS.good, near: STAFF_COLORS.near,
          off: STAFF_COLORS.off, given: STAFF_COLORS.given, piano: STAFF_COLORS.piano }[it.state] || STAFF_COLORS.note;
        const ms = it.notes ? [...it.notes].sort((a, b) => a - b) : [it.midi];
        let prevDia = null, shifted = false;
        for (const m of ms) { // a chord: stacked noteheads, with a 2nd nudged sideways
          const dia = spell(m, this.k, this.flats).dia;
          shifted = prevDia !== null && dia - prevDia === 1 && !shifted;
          this.note(L, x + (shifted ? NOTE_W * sp * 0.95 : 0), m, color, { hollow: it.state === 'given' });
          prevDia = dia;
        }
      }
      if (it.label) this.label(L, x, it.label, it.labelColor || STAFF_COLORS.label);
      // what you sang in this column (a wrong attempt, or your live pitch next to the target)
      for (const s of it.sung || []) {
        g.globalAlpha = 0.85;
        this.note(L, x + NOTE_W * sp * 1.25, s.midi, STAFF_COLORS[s.cls] || STAFF_COLORS.off);
        g.globalAlpha = 1;
      }
    });
  }
}

export { noteText };
