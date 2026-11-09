// The scrolling pitch graph: one lane per semitone (piano-roll style), the voice as a line moving
// right to left, and piano notes you play shown as bars so you can sing against them.

import { LOWEST_KEY, HIGHEST_KEY, isBlack, sciName } from './notes.js';

export const COLORS = { good: '#30d158', near: '#ffd60a', off: '#ff8a4c', line: '#64d2ff', target: '#bf8cff' };
export const accuracyClass = (cents) => (Math.abs(cents) <= 10 ? 'good' : Math.abs(cents) <= 25 ? 'near' : 'off');

export class Graph {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.points = [];     // { t, m, c }  m = line pitch, c = vibrato-averaged pitch (null = silence)
    this.targets = [];    // { midi, t0, t1 }
    this.view = 60;       // MIDI note at the vertical centre
    this.goal = null;
    this.span = 18; this.window = 7; this.flats = false; this.colorize = true; this.showTargets = true;
    this.current = null;  // note shown in the readout (its lane is highlighted)
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

  add(t, m, c) {
    this.points.push({ t, m, c });
    while (this.points.length && t - this.points[0].t > 60) this.points.shift();
    this.dirty = true;
  }

  addTarget(midi, t) { this.targets.push({ midi, t0: t, t1: null }); this.dirty = true; }
  endTarget(midi, t) {
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const x = this.targets[i];
      if (x.midi === midi && x.t1 === null) { x.t1 = t; break; }
    }
    this.dirty = true;
  }
  clearTrace() { this.points.length = 0; this.dirty = true; }

  /** Semitones shown: the chosen graph height, reduced on short screens so lanes stay at least 13 px. */
  get visibleSpan() { return Math.max(7, Math.min(this.span, Math.floor(this.h / 13) || this.span)); }

  /** Ease the view so `m` stays comfortably inside, without chasing every wobble. */
  follow(m, dt) {
    const span = this.visibleSpan, half = span / 2;
    if (m != null && Math.abs(m - this.view) > span * 0.32) this.goal = m;
    if (this.goal != null) {
      this.view += (this.goal - this.view) * (1 - Math.exp(-dt / 0.18));
      if (Math.abs(this.goal - this.view) < 0.05) this.goal = null;
      this.dirty = true;
    }
    this.view = Math.max(LOWEST_KEY + half - 1, Math.min(HIGHEST_KEY - half + 1, this.view));
  }
  jumpTo(m) { this.view = m; this.goal = null; this.dirty = true; }

  /** Anything moving on screen? (lets the app skip redraws when idle) */
  active(now) {
    if (this.dirty || this.goal != null) return true;
    const last = this.points[this.points.length - 1];
    if (last && now - last.t < this.window) return true;
    return this.targets.some((x) => x.t1 === null || now - x.t1 < this.window);
  }

  draw(now) {
    const g = this.g, w = this.w, h = this.h, dpr = this.dpr;
    if (!w || !h) return;
    this.dirty = false;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const span = this.visibleSpan;
    const lane = h / span;
    const gutter = 44, right = 14;
    const plotW = w - gutter - right;
    const pps = plotW / this.window;
    const yOf = (m) => h / 2 - (m - this.view) * lane;
    const xOf = (t) => w - right - (now - t) * pps;

    g.fillStyle = '#0d1016';
    g.fillRect(0, 0, w, h);

    const lo = Math.floor(this.view - span / 2) - 1, hi = Math.ceil(this.view + span / 2) + 1;
    for (let n = lo; n <= hi; n++) {
      const y0 = yOf(n + 0.5);
      g.fillStyle = isBlack(n) ? '#0a0c11' : '#121620';
      g.fillRect(gutter, y0, w - gutter, lane);
      if (n === this.current) { g.fillStyle = 'rgba(100,210,255,0.10)'; g.fillRect(gutter, y0, w - gutter, lane); }
      g.fillStyle = n % 12 === 0 ? '#2c3445' : '#171c26';
      g.fillRect(gutter, yOf(n - 0.5) - (n % 12 === 0 ? 1 : 0.5), w - gutter, n % 12 === 0 ? 1.5 : 0.5);
    }

    // lane labels: the sung note and C's first, then white keys, then black keys, skipping any that would overlap
    g.fillStyle = '#0d1016';
    g.fillRect(0, 0, gutter, h);
    const fs = Math.max(9, Math.min(13, lane * 0.62));
    g.textBaseline = 'middle'; g.textAlign = 'right';
    const rank = (n) => (n === this.current ? 0 : n % 12 === 0 ? 1 : isBlack(n) ? 3 : 2);
    const order = [];
    for (let n = lo; n <= hi; n++) order.push(n);
    order.sort((a, b) => rank(a) - rank(b));
    const placed = [];
    for (const n of order) {
      const y = yOf(n);
      if (placed.some((p) => Math.abs(p - y) < fs + 1)) continue;
      placed.push(y);
      const black = isBlack(n), isC = n % 12 === 0;
      g.font = `${isC || n === this.current ? 700 : 500} ${fs}px -apple-system, system-ui, sans-serif`;
      g.fillStyle = n === this.current ? '#e6f6ff' : isC ? '#c9d2e3' : black ? '#566074' : '#8c97ab';
      g.fillText(this.nameOf ? this.nameOf(n) : sciName(n, this.flats), gutter - 7, y);
    }

    g.save();
    g.beginPath(); g.rect(gutter, 0, w - gutter, h); g.clip();

    // piano notes you played
    if (this.showTargets) {
      for (const x of this.targets) {
        const end = x.t1 === null ? now : Math.min(x.t1, now);
        if (now - end > this.window) continue;
        const x0 = Math.max(gutter, xOf(x.t0)), x1 = xOf(end);
        const y = yOf(x.midi) - lane * 0.4;
        g.fillStyle = 'rgba(191,140,255,0.22)';
        g.strokeStyle = 'rgba(191,140,255,0.75)';
        g.lineWidth = 1;
        roundRect(g, x0, y, Math.max(3, x1 - x0), lane * 0.8, Math.min(6, lane * 0.3));
        g.fill(); g.stroke();
      }
      this.targets = this.targets.filter((x) => x.t1 === null || now - x.t1 < 60);
    }

    // the voice
    g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
    const pts = this.points;
    let start = pts.length;
    while (start > 0 && now - pts[start - 1].t < this.window + 0.2) start--;
    let colour = null, open = false, prev = null;
    for (let i = start; i < pts.length; i++) {
      const p = pts[i];
      if (p.m === null || (prev && p.t - prev.t > 0.1)) {
        if (open) { g.stroke(); open = false; }
        prev = p.m === null ? null : p;
        if (p.m === null) continue;
      }
      const col = this.colorize && p.c != null ? COLORS[accuracyClass((p.c - Math.round(p.c)) * 100)] : COLORS.line;
      const x = xOf(p.t), y = yOf(p.m);
      if (!open || col !== colour) {
        if (open) g.stroke();
        g.strokeStyle = col; colour = col;
        g.beginPath();
        if (prev && prev.m !== null) g.moveTo(xOf(prev.t), yOf(prev.m)); else g.moveTo(x, y);
        open = true;
      }
      g.lineTo(x, y);
      prev = p;
    }
    if (open) g.stroke();

    // "now" marker and the live dot
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(w - right, 0, 1, h);
    const last = pts[pts.length - 1];
    if (last && last.m !== null && now - last.t < 0.12) {
      const col = this.colorize && last.c != null ? COLORS[accuracyClass((last.c - Math.round(last.c)) * 100)] : COLORS.line;
      g.fillStyle = col;
      g.shadowColor = col; g.shadowBlur = 12;
      g.beginPath(); g.arc(xOf(last.t), yOf(last.m), 5.5, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
    }
    g.restore();
  }
}

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
