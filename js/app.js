// Pitch Piano: wires the microphone, pitch tracker, graph, readout, piano and settings together.

import { PitchDetector, PitchTracker, NoteHold, SPEEDS } from './pitch.js';
import { PianoAudio } from './piano-audio.js';
import { Keyboard } from './keyboard.js';
import { Graph, accuracyClass } from './graph.js';
import { sciName, karaokeName, helmholtz, midiToFreq, A4_PRESETS } from './notes.js';

const VERSION = '1.1.2';
const KEY_SIZES = { s: 34, m: 44, l: 56 };
const DEFAULTS = {
  a4: 440, sensitivity: 0.6, speed: 'normal',
  levelStyle: 'karaoke', flats: false, showCents: true, colorTrace: true, span: 18, window: 7,
  highlight: true, followKeys: true, showTargets: true, keyLabels: 'white', keySize: 'm', sustain: true, volume: 0.8,
  echo: false, callAudio: true,
};

// ---------- storage (wrapped: private mode or cleared storage must never break the app) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('pitchpiano.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('pitchpiano.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  del(k) { try { localStorage.removeItem('pitchpiano.' + k); } catch (e) { /* ignore */ } },
};
const S = Object.assign({}, DEFAULTS, store.get('settings', {}));
const save = () => store.set('settings', S);
const $ = (id) => document.getElementById(id);
const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };

// ---------- app-like behaviour: block pinch zoom, double-tap zoom, page drag and long-press menus ----------
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
// Stopping the touch itself is what keeps iOS from showing its magnifying-glass loupe on a long press
// or a drag (CSS alone doesn't). Buttons, sliders and the settings list keep normal touches.
document.addEventListener('touchstart', (e) => { if (!e.target.closest('button, input, .scroll, .scrim')) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- audio ----------
const setSession = (type) => { try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) { /* older iOS */ } };
setSession('playback'); // so the piano still sounds with the ring/silent switch on
const AC = window.AudioContext || window.webkitAudioContext;
const ctx = new AC({ latencyHint: 'interactive' });
const piano = new PianoAudio();
piano.a4 = S.a4; piano.volume = S.volume;
piano.onProgress = (d, n) => setText($('loading'), d < n ? `Loading piano ${d}/${n}` : '');
piano.attach(ctx).catch((e) => { setText($('loading'), 'Piano sounds failed to load'); console.error(e); });

// iOS starts audio suspended until a tap; resume on any touch (also after phone calls or other interruptions)
const wake = () => { if (ctx.state !== 'running') ctx.resume().catch(() => {}); };
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, wake, { capture: true, passive: true });

// ---------- state ----------
const tracker = new PitchTracker({ a4: S.a4, sensitivity: S.sensitivity, speed: S.speed });
const hold = new NoteHold();
let mic = null, listening = false, paused = false, starting = false;
let vt = 0;                  // app clock in seconds; stands still while paused
let shown = null, shownCents = 0, lastVoiced = -10, lastCentre = null;
let stable = { note: null, since: 0 };
let range = store.get('range', null);
let pianoQuietAt = 0;        // the mic hears the piano too: don't count piano notes as your range

// ---------- views ----------
const graph = new Graph($('graph'));
const keyboard = new Keyboard({
  viewport: $('kbd'), inner: $('kbdInner'), minimap: $('minimap'),
  onDown: (m) => {
    wake();
    piano.noteOn(m);
    graph.addTarget(m, vt);
    if (!(listening && vt - lastVoiced < 0.3)) graph.follow(m, 0);
  },
  onUp: (m) => {
    piano.noteOff(m, S.sustain);
    pianoQuietAt = vt + (S.sustain ? 2.5 : 0.4);
    graph.endTarget(m, vt + (S.sustain ? 1.2 : 0));
  },
});
keyboard.whiteW = KEY_SIZES[S.keySize] || 44;
keyboard.place();
let saveTimer = 0;
keyboard.onScroll = (off) => { clearTimeout(saveTimer); saveTimer = setTimeout(() => store.set('kbdCentre', (off + $('kbd').clientWidth / 2) / keyboard.whiteW), 400); };
requestAnimationFrame(() => {
  const c = store.get('kbdCentre', null);
  if (c != null) keyboard.setOffset(c * keyboard.whiteW - $('kbd').clientWidth / 2, false);
  else keyboard.centreOn(60, false);
});

// ---------- microphone ----------
async function startMic() {
  if (listening || starting) return;
  wake();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return showMsg('This browser can’t use the microphone. On iPhone, open the app from Safari or your Home Screen.');
  }
  starting = true; render();
  piano.useCallAudio(S.callAudio); // must happen inside the tap, before any waiting
  setSession('play-and-record');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: S.echo, noiseSuppression: false, autoGainControl: false },
    });
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
    const sink = ctx.createGain(); sink.gain.value = 0; // keeps the analyser running; makes no sound
    src.connect(analyser); analyser.connect(sink); sink.connect(ctx.destination);
    mic = { stream, src, analyser, sink, buf: new Float32Array(analyser.fftSize), det: new PitchDetector({ sampleRate: ctx.sampleRate, size: analyser.fftSize }) };
    for (const t of stream.getAudioTracks()) t.addEventListener('ended', () => stopMic());
    tracker.reset(); hold.reset();
    listening = true; paused = false;
    showMsg(null);
  } catch (err) {
    piano.useCallAudio(false);
    setSession('playback');
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    showMsg(denied
      ? 'Microphone access is off. Tap Start listening again and choose Allow. If it doesn’t ask, check Settings → Apps → Safari → Microphone.'
      : 'Couldn’t start the microphone (' + (err && err.name || 'error') + ').');
  } finally {
    starting = false; render();
  }
}

function stopMic() {
  if (mic) {
    for (const t of mic.stream.getTracks()) t.stop();
    try { mic.src.disconnect(); mic.analyser.disconnect(); mic.sink.disconnect(); } catch (e) { /* ok */ }
    mic = null;
  }
  listening = false; paused = false;
  piano.useCallAudio(false);
  setSession('playback');
  render();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  wake();
  if (mic && mic.stream.getAudioTracks().every((t) => t.readyState === 'ended')) stopMic();
});

// ---------- readout ----------
function levelText(n) {
  if (S.levelStyle === 'karaoke') return karaokeName(n, S.flats);
  if (S.levelStyle === 'helmholtz') return helmholtz(n, S.flats);
  return '';
}

function renderReadout(voiced) {
  $('readout').classList.toggle('idle', !voiced);
  if (shown === null) {
    setText($('rNote'), '–'); setText($('rLevel'), ''); setText($('rHz'), ''); setText($('rCents'), '');
    return;
  }
  setText($('rNote'), sciName(shown, S.flats));
  setText($('rLevel'), levelText(shown));
  if (lastCentre != null) setText($('rHz'), midiToFreq(lastCentre, S.a4).toFixed(1) + ' Hz');
  const cents = $('rCents');
  if (S.showCents && Math.abs(shownCents) <= 60) { // beyond that the name is about to change; don't show +200¢
    const c = shownCents;
    setText(cents, (c > 0 ? '+' : c < 0 ? '−' : '±') + Math.abs(c) + '¢');
    cents.className = 'cents ' + accuracyClass(c);
  } else setText(cents, '');
}

function renderRange() {
  const chip = $('rangeChip');
  if (chip.dataset.confirm) return;
  setText(chip, range ? `Range ${sciName(range.lo, S.flats)} – ${sciName(range.hi, S.flats)}` : 'Range –');
  chip.classList.remove('warn');
}

function trackRange(n, t) {
  if (keyboard.held.size || t < pianoQuietAt) { stable.note = null; return; }
  if (stable.note !== n) { stable = { note: n, since: t }; return; }
  if (t - stable.since < 0.5) return; // a note counts once you've held it for half a second
  if (!range) range = { lo: n, hi: n };
  else if (n < range.lo) range.lo = n;
  else if (n > range.hi) range.hi = n;
  else return;
  store.set('range', range);
  renderRange();
}

$('rangeChip').addEventListener('click', () => {
  const chip = $('rangeChip');
  if (!range) return;
  if (chip.dataset.confirm) {
    delete chip.dataset.confirm; clearTimeout(chip._t);
    range = null; store.del('range'); renderRange();
    return;
  }
  chip.dataset.confirm = '1';
  chip.textContent = 'Tap again to reset range';
  chip.classList.add('warn');
  chip._t = setTimeout(() => { delete chip.dataset.confirm; renderRange(); }, 3000);
});

// ---------- buttons ----------
function showMsg(text) {
  $('msgText').textContent = text || 'Sing, and your pitch draws here.';
  $('msgText').classList.toggle('err', !!text);
}

function render() {
  $('micBtn').classList.toggle('on', listening);
  $('micBtn').setAttribute('aria-label', listening ? 'Stop listening' : 'Start listening');
  $('graphMsg').hidden = listening;
  $('startBtn').disabled = starting;
  $('pauseBtn').disabled = !listening;
  $('pauseBtn').classList.toggle('paused', paused);
  $('pauseBtn').setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  $('pausedTag').classList.toggle('show', paused);
  $('sustainBtn').setAttribute('aria-pressed', String(S.sustain));
  setText($('tuneChip'), `A4 = ${S.a4} Hz`);
}

$('micBtn').addEventListener('click', () => (listening ? stopMic() : startMic()));
$('startBtn').addEventListener('click', startMic);
$('pauseBtn').addEventListener('click', () => { if (listening) { paused = !paused; render(); } });
$('octDown').addEventListener('click', () => keyboard.shift(-1));
$('octUp').addEventListener('click', () => keyboard.shift(1));
$('sustainBtn').addEventListener('click', () => {
  S.sustain = !S.sustain; save();
  if (!S.sustain) piano.releaseAll(new Set(keyboard.held.keys()));
  render();
});

// ---------- main loop ----------
let lastTs = performance.now(), lastDetect = 0;
function loop(ts) {
  const dt = Math.min(0.1, Math.max(0, (ts - lastTs) / 1000));
  lastTs = ts;
  if (!paused) vt += dt;

  if (listening && !paused && mic && ts - lastDetect >= 14) { // ~60 analyses a second, even on 120 Hz screens
    lastDetect = ts;
    mic.analyser.getFloatTimeDomainData(mic.buf);
    const o = tracker.push(mic.det.detect(mic.buf), vt);
    graph.add(vt, o.midi, o.centre);
    if (o.centre !== null) {
      lastVoiced = vt; lastCentre = o.centre;
      const h = hold.update(o.centre, vt);
      shown = h.note; shownCents = h.cents;
      trackRange(shown, vt);
      renderReadout(true);
    } else {
      stable.note = null;
      if (vt - lastVoiced > 0.1) hold.reset(); // after a breath, name the next note straight away
      if (vt - lastVoiced > 0.3) renderReadout(false);
    }
  }

  const live = listening && !paused && vt - lastVoiced < 0.3 ? shown : null;
  if (!paused) {
    graph.current = live;
    graph.follow(live, dt);
    const cls = live == null ? '' : Math.abs(shownCents) <= 60 ? accuracyClass(shownCents) : keyboard.sungClass;
    keyboard.setSung(S.highlight ? live : null, cls);
    if (S.followKeys && live != null) keyboard.follow(live);
  }
  if (graph.active(vt)) graph.draw(vt);
  requestAnimationFrame(loop);
}

// ---------- settings ----------
const SECTIONS = [
  { title: 'Listening', items: [
    { key: 'sensitivity', type: 'slider', label: 'Mic sensitivity', min: 0, max: 1, step: 0.01,
      hint: 'Lower it if room noise shows up as a line. Raise it if quiet singing is missed.' },
    { key: 'speed', type: 'seg', label: 'Response', options: [['fast', 'Fast'], ['normal', 'Normal'], ['smooth', 'Smooth']],
      hint: 'Fast follows quick runs and ornaments; Smooth gives a calmer line and steadier note name.' },
    { key: 'a4', type: 'tuning', label: 'Tuning (A4)', hint: 'Sets both the note names and the piano. 415 for Baroque pitch.' },
  ] },
  { title: 'Display', items: [
    { key: 'levelStyle', type: 'seg', label: 'Octave label under the note',
      options: [['karaoke', 'mid2 A'], ['helmholtz', 'a′'], ['off', 'Off']],
      hint: 'mid2 A: karaoke style (as in Pitch Checker); middle C = mid2 C, C5 = hi C. a′: Helmholtz; middle C = c′.' },
    { key: 'flats', type: 'seg', label: 'Accidentals', options: [[false, 'Sharps ♯'], [true, 'Flats ♭']] },
    { key: 'showCents', type: 'toggle', label: 'Show cents (how sharp or flat)' },
    { key: 'colorTrace', type: 'toggle', label: 'Colour by accuracy', hint: 'Green within 10 cents, yellow within 25, orange beyond.' },
    { key: 'span', type: 'seg', label: 'Graph height', options: [[12, '1 octave'], [18, '1½'], [24, '2 octaves']] },
    { key: 'window', type: 'seg', label: 'Graph length', options: [[4, '4 sec'], [7, '7 sec'], [12, '12 sec']] },
  ] },
  { title: 'Piano', items: [
    { key: 'highlight', type: 'toggle', label: 'Light up the note I’m singing' },
    { key: 'followKeys', type: 'toggle', label: 'Scroll the keys to my voice' },
    { key: 'showTargets', type: 'toggle', label: 'Show piano notes on the graph' },
    { key: 'keyLabels', type: 'seg', label: 'Key labels', options: [['white', 'All'], ['c', 'C only'], ['none', 'None']] },
    { key: 'keySize', type: 'seg', label: 'Key size', options: [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']] },
    { key: 'volume', type: 'slider', label: 'Piano volume', min: 0, max: 1, step: 0.01 },
  ] },
  { title: 'iPhone audio', items: [
    { key: 'callAudio', type: 'toggle', label: 'Louder piano while listening',
      hint: 'While the mic is on, plays the piano the way iPhone plays call audio, so it isn’t turned down. If the piano sounds late or choppy while listening, turn this off.' },
    { key: 'echo', type: 'toggle', label: 'Echo cancellation',
      hint: 'Keeps the piano out of the microphone (needs Louder piano on). It can also change how your voice is picked up. Applies the next time you start listening.' },
  ] },
];

function buildSettings() {
  const body = $('settingsBody');
  body.textContent = '';
  for (const sec of SECTIONS) {
    const t = document.createElement('div'); t.className = 'section-title'; t.textContent = sec.title; body.appendChild(t);
    const grp = document.createElement('div'); grp.className = 'group'; body.appendChild(grp);
    for (const it of sec.items) grp.appendChild(buildRow(it));
  }
  const t = document.createElement('div'); t.className = 'section-title'; t.textContent = 'About'; body.appendChild(t);
  const grp = document.createElement('div'); grp.className = 'group'; body.appendChild(grp);
  const about = document.createElement('div'); about.className = 'about';
  about.innerHTML = `Pitch Piano ${VERSION}. Your own app: no ads, no account, nothing leaves your phone.<br>
    Piano: Steinway B recordings from the Versilian Community Sample Library (CC0), Versilian Studios / Sam Gossner.`;
  grp.appendChild(about);
  const row = document.createElement('div'); row.className = 'row';
  const reset = document.createElement('button'); reset.className = 'danger'; reset.textContent = 'Reset all settings';
  reset.addEventListener('click', () => {
    if (reset.dataset.confirm) { Object.assign(S, DEFAULTS); save(); applySettings(); buildSettings(); return; }
    reset.dataset.confirm = '1'; reset.textContent = 'Tap again to reset everything';
    setTimeout(() => { delete reset.dataset.confirm; reset.textContent = 'Reset all settings'; }, 3000);
  });
  row.appendChild(reset); grp.appendChild(row);
}

function buildRow(it) {
  const row = document.createElement('div');
  const label = document.createElement('div'); label.className = 'label'; label.textContent = it.label;
  const hint = it.hint ? Object.assign(document.createElement('div'), { className: 'hint', textContent: it.hint }) : null;
  const set = (v) => { S[it.key] = v; save(); applySettings(); };

  if (it.type === 'toggle') {
    row.className = 'row';
    const left = document.createElement('div'); left.appendChild(label); if (hint) left.appendChild(hint);
    const sw = document.createElement('button'); sw.className = 'switch'; sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-label', it.label);
    sw.setAttribute('aria-checked', String(!!S[it.key]));
    sw.addEventListener('click', () => { set(!S[it.key]); sw.setAttribute('aria-checked', String(!!S[it.key])); });
    row.append(left, sw);
    return row;
  }
  row.className = 'row stack';
  row.appendChild(label);
  if (it.type === 'seg') {
    const seg = document.createElement('div'); seg.className = 'seg';
    for (const [v, text] of it.options) {
      const b = document.createElement('button'); b.textContent = text;
      b.classList.toggle('sel', S[it.key] === v);
      b.addEventListener('click', () => { set(v); for (const x of seg.children) x.classList.toggle('sel', x === b); });
      seg.appendChild(b);
    }
    row.appendChild(seg);
  } else if (it.type === 'slider') {
    const r = document.createElement('input');
    Object.assign(r, { type: 'range', min: it.min, max: it.max, step: it.step, value: S[it.key], className: 'slider' });
    r.setAttribute('aria-label', it.label);
    r.addEventListener('input', () => set(+r.value));
    row.appendChild(r);
  } else if (it.type === 'tuning') {
    const wrap = document.createElement('div'); wrap.className = 'tuning';
    const minus = Object.assign(document.createElement('button'), { className: 'step', textContent: '−' });
    const plus = Object.assign(document.createElement('button'), { className: 'step', textContent: '+' });
    const val = document.createElement('div'); val.className = 'val';
    const presets = document.createElement('div'); presets.className = 'presets';
    const show = () => {
      val.textContent = `${S.a4} Hz`;
      for (const b of presets.children) b.classList.toggle('sel', +b.dataset.hz === S.a4);
    };
    for (const p of A4_PRESETS) {
      const b = document.createElement('button'); b.dataset.hz = p.hz; b.textContent = `${p.hz} ${p.label}`;
      b.addEventListener('click', () => { set(p.hz); show(); });
      presets.appendChild(b);
    }
    minus.addEventListener('click', () => { set(Math.max(380, S.a4 - 1)); show(); });
    plus.addEventListener('click', () => { set(Math.min(480, S.a4 + 1)); show(); });
    wrap.append(minus, val, plus);
    row.append(wrap, presets);
    show();
  }
  if (hint) row.appendChild(hint);
  return row;
}

function applySettings() {
  tracker.a4 = S.a4; tracker.setSensitivity(S.sensitivity); tracker.setSpeed(S.speed);
  hold.hold = (SPEEDS[S.speed] || SPEEDS.normal).hold;
  piano.a4 = S.a4; piano.setVolume(S.volume);
  Object.assign(graph, { span: S.span, window: S.window, flats: S.flats, colorize: S.colorTrace, showTargets: S.showTargets, dirty: true });
  keyboard.setLabels(S.keyLabels, S.flats);
  const w = KEY_SIZES[S.keySize] || 44;
  if (w !== keyboard.whiteW) keyboard.setKeyWidth(w);
  if (!S.highlight) keyboard.setSung(null, '');
  if (listening) piano.useCallAudio(S.callAudio);
  renderReadout(listening && vt - lastVoiced < 0.3);
  renderRange();
  render();
}

function openSettings(open) {
  $('sheet').classList.toggle('open', open);
  $('sheet').setAttribute('aria-hidden', String(!open));
}
$('setBtn').addEventListener('click', () => openSettings(true));
$('tuneChip').addEventListener('click', () => openSettings(true));
$('doneBtn').addEventListener('click', () => openSettings(false));
$('scrim').addEventListener('click', () => openSettings(false));

// ---------- first visit in Safari: how to install ----------
const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (iOS && !standalone && !store.get('tipDismissed', false)) $('installTip').hidden = false;
$('tipClose').addEventListener('click', () => { $('installTip').hidden = true; store.set('tipDismissed', true); });

// ---------- offline support ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // When an update has downloaded, switch to it right away unless you're in the middle of singing.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !listening && !keyboard.held.size && !reloading) { reloading = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

buildSettings();
applySettings();
requestAnimationFrame(loop);

// handle for automated checks
window.__pp = { S, graph, keyboard, piano, tracker, ctx, get listening() { return listening; }, get shown() { return shown; }, get range() { return range; }, startMic, stopMic, VERSION };
