// The 88-key keyboard and its overview strip.
// The keys never scroll by dragging (a finger on the keys only ever plays). Moving along the keyboard
// is done with the overview strip above it or the ‹ › octave buttons, so nothing moves by accident.

import { LOWEST_KEY, HIGHEST_KEY, isBlack, sciName } from './notes.js';

const WHITES = [];
for (let m = LOWEST_KEY; m <= HIGHEST_KEY; m++) if (!isBlack(m)) WHITES.push(m);
const whiteIndex = new Map(WHITES.map((m, i) => [m, i]));

export class Keyboard {
  constructor({ viewport, inner, minimap, onDown, onUp }) {
    this.vp = viewport; this.inner = inner; this.map = minimap;
    this.onDown = onDown; this.onUp = onUp;
    this.whiteW = 44; this.offset = 0; this.flats = false; this.labels = 'white';
    this.keys = new Map();        // midi -> element
    this.pointers = new Map();    // pointerId -> midi
    this.held = new Map();        // midi -> count of fingers on it
    this.sung = null; this.sungClass = '';
    this.lastManual = 0;
    this.build();
    this.bindKeys();
    this.bindMap();
    new ResizeObserver(() => this.resize()).observe(this.vp);
  }

  build() {
    this.inner.textContent = '';
    for (let m = LOWEST_KEY; m <= HIGHEST_KEY; m++) {
      const k = document.createElement('div');
      k.className = isBlack(m) ? 'key black' : 'key white' + (m % 12 === 0 ? ' c' : '');
      k.dataset.midi = m;
      if (!isBlack(m)) { const l = document.createElement('span'); l.className = 'lab'; k.appendChild(l); }
      this.inner.appendChild(k);
      this.keys.set(m, k);
    }
    this.place();
  }

  place() {
    const W = this.whiteW, bw = Math.round(W * 0.6);
    this.blackW = bw;
    this.inner.style.width = WHITES.length * W + 'px';
    for (const [m, k] of this.keys) {
      if (isBlack(m)) {
        const left = (whiteIndex.get(m - 1) + 1) * W - bw / 2;
        k.style.left = left + 'px'; k.style.width = bw + 'px';
      } else {
        k.style.left = whiteIndex.get(m) * W + 'px'; k.style.width = W + 'px';
      }
    }
    this.relabel();
  }

  setKeyWidth(w) {
    const centre = this.offset + this.vp.clientWidth / 2;
    const ratio = w / this.whiteW;
    this.whiteW = w;
    this.place();
    this.setOffset(centre * ratio - this.vp.clientWidth / 2, false);
  }

  setLabels(mode, flats) { this.labels = mode; this.flats = flats; this.relabel(); }

  relabel() {
    for (const [m, k] of this.keys) {
      const l = k.querySelector('.lab');
      if (!l) continue;
      const show = this.labels === 'white' || (this.labels === 'c' && m % 12 === 0);
      l.textContent = show ? sciName(m, this.flats) : '';
    }
  }

  get maxOffset() { return Math.max(0, WHITES.length * this.whiteW - this.vp.clientWidth); }

  setOffset(px, animate = true) {
    this.offset = Math.max(0, Math.min(this.maxOffset, px));
    this.inner.classList.toggle('glide', animate);
    this.inner.style.transform = `translate3d(${-this.offset}px,0,0)`;
    this.drawMap();
    if (this.onScroll) this.onScroll(this.offset);
  }

  resize() { this.setOffset(this.offset, false); this.drawMap(); }

  /** Centre a note in view. */
  centreOn(midi, animate = true) {
    const x = this.xOf(midi);
    this.setOffset(x - this.vp.clientWidth / 2, animate);
  }

  xOf(midi) {
    if (isBlack(midi)) return (whiteIndex.get(midi - 1) + 1) * this.whiteW;
    return (whiteIndex.get(midi) + 0.5) * this.whiteW;
  }

  /** Scroll so a sung note is visible, unless the player is using the keyboard right now. */
  follow(midi) {
    if (midi == null || this.pointers.size || performance.now() - this.lastManual < 2500) return;
    const x = this.xOf(midi), margin = this.whiteW * 1.5;
    if (x < this.offset + margin || x > this.offset + this.vp.clientWidth - margin) this.centreOn(midi);
  }

  shift(octaves) {
    this.lastManual = performance.now();
    this.setOffset(this.offset + octaves * 7 * this.whiteW, true);
  }

  /** Which key is under a screen point (black keys win in their area). */
  keyAt(clientX, clientY) {
    const r = this.vp.getBoundingClientRect();
    const y = clientY - r.top, x = clientX - r.left + this.offset;
    if (y < 0 || y > r.height || x < 0) return null;
    const wi = Math.floor(x / this.whiteW);
    if (wi >= WHITES.length) return null;
    if (y < r.height * 0.62) {
      const half = this.blackW / 2;
      const right = WHITES[wi] + 1, left = WHITES[wi] - 1;
      if (right <= HIGHEST_KEY && isBlack(right) && x > (wi + 1) * this.whiteW - half) return right;
      if (left >= LOWEST_KEY && isBlack(left) && x < wi * this.whiteW + half) return left;
    }
    return WHITES[wi];
  }

  bindKeys() {
    const press = (m) => {
      const n = (this.held.get(m) || 0) + 1;
      this.held.set(m, n);
      if (n === 1) { this.keys.get(m).classList.add('down'); this.onDown(m); }
    };
    const release = (m) => {
      const n = (this.held.get(m) || 0) - 1;
      if (n > 0) { this.held.set(m, n); return; }
      this.held.delete(m);
      this.keys.get(m).classList.remove('down');
      this.onUp(m);
    };
    const end = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const m = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (m != null) release(m);
    };
    this.vp.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { this.vp.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
      const m = this.keyAt(e.clientX, e.clientY);
      this.pointers.set(e.pointerId, m);
      if (m != null) press(m);
    });
    this.vp.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const m = this.keyAt(e.clientX, e.clientY), was = this.pointers.get(e.pointerId);
      if (m === was) return;
      this.pointers.set(e.pointerId, m);
      if (was != null) release(was);
      if (m != null) press(m); // sliding across keys plays each one, like a glissando
    });
    this.vp.addEventListener('pointerup', end);
    this.vp.addEventListener('pointercancel', end);
    this.vp.addEventListener('lostpointercapture', end);
  }

  setSung(midi, cls) {
    if (midi === this.sung && cls === this.sungClass) return;
    if (this.sung != null) this.keys.get(this.sung)?.classList.remove('sung', 'good', 'near', 'off');
    this.sung = midi; this.sungClass = cls;
    if (midi != null && this.keys.has(midi)) this.keys.get(midi).classList.add('sung', cls);
    this.drawMap();
  }

  // ---- overview strip ----
  bindMap() {
    let active = null;
    const go = (e) => {
      const r = this.map.getBoundingClientRect();
      const frac = (e.clientX - r.left) / r.width;
      this.lastManual = performance.now();
      this.setOffset(frac * WHITES.length * this.whiteW - this.vp.clientWidth / 2, false);
    };
    this.map.addEventListener('pointerdown', (e) => {
      e.preventDefault(); active = e.pointerId;
      try { this.map.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
      go(e);
    });
    this.map.addEventListener('pointermove', (e) => { if (e.pointerId === active) go(e); });
    const stop = (e) => { if (e.pointerId === active) active = null; };
    this.map.addEventListener('pointerup', stop);
    this.map.addEventListener('pointercancel', stop);
  }

  drawMap() {
    const c = this.map, dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const kw = w / WHITES.length;
    g.fillStyle = '#d9dbe0';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#9aa0ab';
    for (let i = 1; i < WHITES.length; i++) g.fillRect(Math.round(i * kw), 0, 0.5, h);
    g.fillStyle = '#2a2d34';
    for (let m = LOWEST_KEY; m <= HIGHEST_KEY; m++) if (isBlack(m)) {
      const x = (whiteIndex.get(m - 1) + 1) * kw;
      g.fillRect(x - kw * 0.3, 0, kw * 0.6, h * 0.6);
    }
    // middle C marker
    g.fillStyle = '#5b8cff';
    g.beginPath(); g.arc((whiteIndex.get(60) + 0.5) * kw, h - 4, 2, 0, Math.PI * 2); g.fill();
    if (this.sung != null) {
      const x = isBlack(this.sung) ? (whiteIndex.get(this.sung - 1) + 1) * kw : (whiteIndex.get(this.sung) + 0.5) * kw;
      g.fillStyle = this.sungClass === 'good' ? '#30d158' : this.sungClass === 'near' ? '#ffd60a' : '#ff8a4c';
      g.fillRect(x - 2, 0, 4, h);
    }
    // the part of the keyboard currently on screen
    const total = WHITES.length * this.whiteW;
    const x0 = (this.offset / total) * w, x1 = ((this.offset + this.vp.clientWidth) / total) * w;
    g.fillStyle = 'rgba(10,12,16,0.55)';
    g.fillRect(0, 0, x0, h); g.fillRect(x1, 0, w - x1, h);
    g.strokeStyle = '#5b8cff'; g.lineWidth = 2;
    g.strokeRect(x0 + 1, 1, Math.max(2, x1 - x0 - 2), h - 2);
  }
}
