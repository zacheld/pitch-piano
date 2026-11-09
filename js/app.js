// Pitch Piano: wires the microphone, pitch tracker, graph/staff, readout, piano, practice, recording
// and settings together.

import { PitchDetector, PitchTracker, NoteHold, SPEEDS } from './pitch.js';
import { PianoAudio } from './piano-audio.js';
import { Keyboard } from './keyboard.js';
import { Graph, accuracyClass } from './graph.js';
import { StaffView } from './staff.js';
import { karaokeBlock, midiToFreq, A4_PRESETS } from './notes.js';
import { KEYS, NO_KEY, keyById, spell, noteName, noteText, solfege, CLEF_VIEWS } from './notation.js';
import { chooseTonic, makeRng, LEVELS } from './melody.js';
import { Transcriber } from './analysis.js';
import { EXERCISES, exerciseById, LEVEL_NAMES } from './practice.js';
import { TOPICS, THEORY_ITEMS } from './theory.js';
import { Drone } from './drone.js';
import { Recorder } from './recorder.js';

const VERSION = '1.3.0';
const KEY_SIZES = { s: 34, m: 44, l: 56 };
const VOICES = {
  bass: { label: 'Bass', full: [40, 64], comfy: [41, 57] },
  baritone: { label: 'Baritone', full: [43, 67], comfy: [45, 62] },
  tenor: { label: 'Tenor', full: [48, 72], comfy: [50, 69] },
  alto: { label: 'Alto', full: [53, 77], comfy: [55, 72] },
  mezzo: { label: 'Mezzo', full: [57, 81], comfy: [58, 74] },
  soprano: { label: 'Soprano', full: [60, 84], comfy: [62, 79] },
};
const STRICT = { relaxed: 50, normal: 35, strict: 20 };
const DEFAULTS = {
  a4: 440, sensitivity: 0.6, speed: 'normal',
  levelStyle: 'karaoke', flats: false, showCents: true, colorTrace: true, span: 18, window: 7,
  highlight: true, followKeys: true, showTargets: true, keyLabels: 'white', keySize: 'm', sustain: true, volume: 0.8,
  echo: false, callAudio: true,
  view: 'graph', key: 'C', clef: 'tenor', staffLabels: 'names', staffLine: true,
  voice: 'tenor', rangeLow: null, rangeHigh: null, strict: 'normal', droneFifth: true, ex: {}, levels: {}, practiceKey: 'random', calib: 0,
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seedParam = new URLSearchParams(location.search).get('seed');
const rng = seedParam ? makeRng(+seedParam) : Math.random;

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
const drone = new Drone(ctx, piano.out);
const recorder = new Recorder(ctx, piano.out);

// iOS starts audio suspended until a tap; resume on any touch (also after phone calls or other interruptions)
let resumeMic = false;
const wake = () => {
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  if (piano.route === 'stream' && piano.el && piano.el.paused) { const p = piano.el.play(); if (p && p.catch) p.catch(() => {}); }
  if (resumeMic && !listening && !starting) { resumeMic = false; startMic(); }
};
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, wake, { capture: true, passive: true });

// ---------- state ----------
const tracker = new PitchTracker({ a4: S.a4, sensitivity: S.sensitivity, speed: S.speed });
const hold = new NoteHold();
const transcriber = new Transcriber({ minHold: 0.25, skip: 0.12 });
let mic = null, listening = false, paused = false, starting = false;
let vt = 0;                  // app clock in seconds; stands still while paused
let shown = null, shownCents = 0, lastVoiced = -10, lastCentre = null;
let stable = { note: null, since: 0 };
let range = store.get('range', null);
let pianoQuietAt = 0;        // the mic hears the piano too: don't count piano notes as your range
let muteUntil = 0, playing = false, playToken = 0; // practice prompts: the mic is ignored while they play
let practice = null, practiceDef = null;
let recLog = null, recStart = 0, recTake = null, replay = null;
let stageView = S.view;

// ---------- keys, names, ranges ----------
const currentKey = () => keyById(S.key);
const practiceKey = () => (currentKey().none ? keyById('C') : currentKey());
const spelledName = (m, key = currentKey()) => noteName(spell(m, key, S.flats));
const voice = () => VOICES[S.voice] || VOICES.tenor;
const practiceRange = () => ({ low: S.rangeLow ?? voice().comfy[0], high: S.rangeHigh ?? voice().comfy[1] });
const fullRange = () => ({ low: Math.min(voice().full[0], practiceRange().low), high: Math.max(voice().full[1], practiceRange().high) });
const PRIMES = ['', '′', '″', '‴', '⁗', '⁗′'];
function levelText(m) {
  const n = spell(m, currentKey(), S.flats), l = noteText(n);
  if (S.levelStyle === 'karaoke') return `${karaokeBlock(m)} ${l}`;
  if (S.levelStyle === 'helmholtz') return n.octave >= 3 ? l.toLowerCase() + PRIMES[Math.min(n.octave - 3, 5)] : n.octave === 2 ? l : l + '͵'.repeat(2 - n.octave);
  return '';
}

// ---------- views ----------
const graph = new Graph($('graph'));
graph.nameOf = (m) => spelledName(m);
const staff = new StaffView($('staff'));
const keyboard = new Keyboard({
  viewport: $('kbd'), inner: $('kbdInner'), minimap: $('minimap'),
  onDown: (m) => {
    wake();
    piano.noteOn(m);
    if (recorder.recording && recLog) recLog.piano.push({ t: vt - recStart, m, on: true });
    if (practice) { practice.key(m); return; }
    graph.addTarget(m, vt);
    staff.write(m, 'piano', null, vt);
    if (!(listening && vt - lastVoiced < 0.3)) graph.follow(m, 0);
  },
  onUp: (m) => {
    piano.noteOff(m, S.sustain);
    pianoQuietAt = vt + (S.sustain ? 2.5 : 0.4);
    if (recorder.recording && recLog) recLog.piano.push({ t: vt - recStart, m, on: false });
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

function setStageView(v, temporary = false) {
  stageView = v;
  $('graph').hidden = v !== 'graph';
  $('staff').hidden = v !== 'staff';
  if (!temporary) { S.view = v; save(); }
  $('viewGraph').classList.toggle('sel', v === 'graph');
  $('viewStaff').classList.toggle('sel', v === 'staff');
  $('viewGraph').parentElement.classList.toggle('locked', !!practice);
  graph.resize(); staff.resize();
}
$('viewGraph').addEventListener('click', () => { if (!practice) setStageView('graph'); });
$('viewStaff').addEventListener('click', () => { if (!practice) setStageView('staff'); });

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
    tracker.reset(); hold.reset(); transcriber.reset();
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
  if (recorder.recording) stopRecording();
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

// Leaving the app with the mic on used to leave the sound dead on return (iOS pauses the capture and
// the call-audio path). So: release the mic when the app goes to the background, and bring it back
// with the first touch after returning (a touch is needed for iOS to allow audio again).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (listening) { resumeMic = true; stopMic(); }
    return;
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
});

// ---------- readout ----------
function renderReadout(voiced) {
  $('readout').classList.toggle('idle', !voiced);
  if (shown === null) {
    setText($('rNote'), '–'); setText($('rLevel'), ''); setText($('rHz'), ''); setText($('rCents'), '');
    return;
  }
  setText($('rNote'), spelledName(shown));
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
  setText(chip, range ? `Range ${spelledName(range.lo)} – ${spelledName(range.hi)}` : 'Range –');
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
let toastTimer = 0;
function showMsg(text) {
  const t = $('toast');
  clearTimeout(toastTimer);
  t.hidden = !text;
  if (text) { t.textContent = text; toastTimer = setTimeout(() => { t.hidden = true; }, 7000); }
}
$('toast').addEventListener('click', () => { $('toast').hidden = true; });

function render() {
  $('micBtn').classList.toggle('on', listening);
  $('micBtn').setAttribute('aria-label', listening ? 'Stop listening' : 'Start listening');
  $('pauseBtn').disabled = !listening;
  $('pauseBtn').classList.toggle('paused', paused);
  $('pauseBtn').setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  $('pausedTag').classList.toggle('show', paused);
  $('sustainBtn').setAttribute('aria-pressed', String(S.sustain));
  const key = currentKey();
  setText($('keyChip'), (key.none ? 'No key' : key.name) + (S.a4 !== 440 ? ` · A${S.a4}` : ''));
  $('practiceBtn').classList.toggle('on', !!practice);
  $('recBtn').classList.toggle('on', recorder.recording);
  $('recBtn').setAttribute('aria-label', recorder.recording ? 'Stop recording' : 'Record');
  if (!recorder.recording) setText($('recTime'), '');
  $('replayBar').hidden = !recTake || recorder.recording;
  setText($('replayBtn'), replay ? '■ Stop' : `▶ Replay ${fmtTime(recTake ? recTake.seconds : 0)}`);
  $('droneChip').hidden = !drone.on;
  if (drone.on) setText($('droneChip'), `Drone ${noteText(spell(drone.midi, practiceKey()))} ■`);
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

$('micBtn').addEventListener('click', () => (listening ? stopMic() : startMic()));
$('pauseBtn').addEventListener('click', () => { if (listening) { paused = !paused; render(); } });
$('octDown').addEventListener('click', () => keyboard.shift(-1));
$('octUp').addEventListener('click', () => keyboard.shift(1));
$('sustainBtn').addEventListener('click', () => {
  S.sustain = !S.sustain; save();
  if (!S.sustain) piano.releaseAll(new Set(keyboard.held.keys()));
  render();
});

// ---------- one frame of pitch (live, or from a recording being replayed) ----------
function processFrame(o, { record = true, rangeOk = true } = {}) {
  graph.add(vt, o.midi, o.centre);
  if (o.centre !== null) {
    lastVoiced = vt; lastCentre = o.centre;
    const h = hold.update(o.centre, vt);
    shown = h.note; shownCents = h.cents;
    if (rangeOk) trackRange(shown, vt);
    renderReadout(true);
  } else {
    stable.note = null;
    if (vt - lastVoiced > 0.1) hold.reset(); // after a breath, name the next note straight away
    if (vt - lastVoiced > 0.3) renderReadout(false);
  }
  const liveNote = o.centre !== null ? shown : null;
  const cls = liveNote != null && Math.abs(shownCents) <= 60 ? accuracyClass(shownCents) : 'current';
  if (!practice) {
    staff.addLine(vt, o.midi, cls);
    const ev = transcriber.feed(vt, liveNote, shownCents);
    if (ev && ev.type === 'write') staff.write(ev.note, 'voice', accuracyClass(ev.cents), vt);
    else if (ev && ev.type === 'update') staff.updateLast(accuracyClass(ev.cents));
    staff.setLive(liveNote, cls);
  }
  if (record && recorder.recording && recLog) recLog.frames.push({ t: vt - recStart, midi: o.midi, centre: o.centre });
  return liveNote;
}

// ---------- main loop ----------
let lastTs = performance.now(), lastDetect = 0;
function loop(ts) {
  const dt = Math.min(0.1, Math.max(0, (ts - lastTs) / 1000));
  lastTs = ts;
  if (!paused) vt += dt;

  if (listening && !paused && mic && !replay && ts - lastDetect >= 14) { // ~60 analyses a second, even on 120 Hz screens
    lastDetect = ts;
    mic.analyser.getFloatTimeDomainData(mic.buf);
    const o = tracker.push(mic.det.detect(mic.buf), vt);
    const muted = (playing || vt < muteUntil) && !(practice && practice.hearsItself);
    if (muted && practice) {
      processFrame({ midi: null, centre: null }, { rangeOk: false });
      if (practice.needsMic) practice.frame(vt, null, 0, null, null);
    } else {
      const liveNote = processFrame(o, { rangeOk: !muted });
      if (practice && practice.needsMic) practice.frame(vt, liveNote, shownCents, o.midi, o.centre);
    }
  }
  if (replay) stepReplay();
  if (recorder.recording && Math.floor(ts / 250) !== Math.floor((ts - dt * 1000) / 250)) setText($('recTime'), fmtTime(recorder.seconds));

  const live = (listening || replay) && !paused && vt - lastVoiced < 0.3 ? shown : null;
  if (!paused) {
    graph.current = live;
    graph.follow(live, dt);
    const cls = live == null ? '' : Math.abs(shownCents) <= 60 ? accuracyClass(shownCents) : keyboard.sungClass;
    keyboard.setSung(S.highlight ? live : null, cls);
    if (S.followKeys && live != null) keyboard.follow(live);
  }
  if (stageView === 'graph' && graph.active(vt)) graph.draw(vt);
  if (stageView === 'staff' && (staff.active() || (live != null && S.staffLine))) staff.draw(vt, dt);
  requestAnimationFrame(loop);
}

// ---------- record and replay ----------
async function toggleRecord() {
  if (recorder.recording) return stopRecording();
  if (!listening) { await startMic(); if (!listening) return; }
  stopReplay();
  if (practice) stopPractice();
  recLog = { frames: [], piano: [] };
  recStart = vt;
  try { await recorder.start(mic.src); } catch (e) { showMsg('Recording isn’t available here.'); console.error(e); return; }
  render();
}
async function stopRecording() {
  const take = await recorder.stop();
  if (take) recTake = { ...take, frames: recLog ? recLog.frames : [], piano: recLog ? recLog.piano : [] };
  recLog = null;
  render();
}
recorder.onFull = () => stopRecording();
$('recBtn').addEventListener('click', toggleRecord);

function startReplay() {
  if (!recTake) return;
  if (practice) stopPractice();
  stopReplay();
  graph.clearTrace(); staff.clear(); transcriber.reset(); hold.reset();
  recorder.play(() => stopReplay());
  replay = { i: 0, j: 0 };
  render();
}
function stopReplay() {
  if (!replay) return;
  replay = null;
  recorder.stopPlaying();
  $('replayFill').style.width = '0';
  render();
}
function stepReplay() {
  const pos = recorder.playPosition;
  const { frames, piano: keys } = recTake;
  while (replay.i < frames.length && frames[replay.i].t <= pos) {
    const f = frames[replay.i++];
    processFrame({ midi: f.midi, centre: f.centre }, { record: false, rangeOk: false });
  }
  while (replay.j < keys.length && keys[replay.j].t <= pos) {
    const k = keys[replay.j++];
    if (k.on) { graph.addTarget(k.m, vt); staff.write(k.m, 'piano', null, vt); } else graph.endTarget(k.m, vt);
  }
  $('replayFill').style.width = `${Math.min(100, (pos / recTake.seconds) * 100)}%`;
}
$('replayBtn').addEventListener('click', () => (replay ? stopReplay() : startReplay()));

// ---------- drone ----------
function droneMidi() {
  const key = practiceKey(), r = practiceRange();
  const place = chooseTonic(key, r.low, r.high);
  const t = place ? place.t : 48 + ((key.tonic.l * 2) % 12);
  return t - 12 >= voice().full[0] - 5 ? t - 12 : t; // an octave below the melody, if the voice goes that low
}
function setDrone(on) {
  if (on) { wake(); drone.start(droneMidi(), { fifth: S.droneFifth, a4: S.a4 }); } else drone.stop();
  render();
}
$('droneChip').addEventListener('click', () => setDrone(false));

// ---------- practice ----------
function playSeq(seq, { listen = false } = {}) {
  const token = ++playToken;
  playing = !listen;
  return (async () => {
    for (const step of seq) {
      if (token !== playToken) break;
      for (const m of step.notes) piano.noteOn(m);
      await sleep(step.dur * 1000);
      if (token !== playToken) break;
      for (const m of step.notes) piano.noteOff(m, false);
      if (step.gap) await sleep(step.gap * 1000);
    }
    if (token === playToken) { playing = false; muteUntil = vt + 0.35; }
    return token === playToken;
  })();
}
function stopSeq() {
  playToken++; playing = false; muteUntil = vt + 0.2;
  piano.releaseAll(new Set(keyboard.held.keys()));
}

function layoutExercise() {
  staff.padTop = practice ? $('exBar').offsetHeight : 0;
  staff.padBottom = practice ? $('exPanel').offsetHeight : 0;
  staff.dirty = true;
}
const ui = {
  title: (t) => setText($('exTitle'), t),
  question: (html) => { if ($('exQuestion').innerHTML !== html) { $('exQuestion').innerHTML = html; layoutExercise(); } },
  score: (t) => setText($('exScore'), t),
  prompt: (html) => { if ($('exPrompt').innerHTML !== html) { $('exPrompt').innerHTML = html; layoutExercise(); } },
  buttons: (list) => {
    const box = $('exButtons');
    box.textContent = '';
    for (const b of list) {
      const el = document.createElement('button');
      el.textContent = b.label; el.dataset.id = b.id;
      if (b.primary) el.className = 'primary';
      el.addEventListener('click', () => { wake(); if (practice) practice.button(b.id); });
      box.appendChild(el);
    }
    layoutExercise();
  },
  answers: (list, cols = 7) => {
    const box = $('exAnswers');
    box.textContent = '';
    box.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    box.classList.toggle('text', cols <= 4);
    for (const a of list || []) {
      const el = document.createElement('button');
      el.innerHTML = `<b>${a.label}</b><span>${a.sub || ''}</span>`;
      el.disabled = !!a.disabled;
      el.addEventListener('click', () => { wake(); if (practice) practice.answer(a.value); });
      box.appendChild(el);
    }
    layoutExercise();
  },
};
const randomKey = () => KEYS[Math.floor(rng() * KEYS.length)];
const env = {
  key: () => (S.practiceKey === 'mine' ? practiceKey() : randomKey()),
  randomKey,
  range: practiceRange,
  full: fullRange,
  tol: () => STRICT[S.strict] || 35,
  rng,
  play: playSeq,
  staff,
  view: (v) => setStageView(v, true),
  ui,
  name: (m, key) => noteName(spell(m, key || practiceKey(), S.flats)),
  sol: (m, key) => solfege(m, key || practiceKey()),
  load: (id, d) => store.get('ex.' + id, d),
  save: (id, v) => store.set('ex.' + id, v),
  startById: (id) => startPractice(id),
  tone: (m, seconds) => {
    const o = ctx.createOscillator(), a = ctx.createGain(), t = ctx.currentTime;
    o.frequency.value = midiToFreq(m, S.a4);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.35, t + 0.03);
    a.gain.setValueAtTime(0.35, t + seconds - 0.05); a.gain.linearRampToValueAtTime(0, t + seconds);
    o.connect(a).connect(piano.out); o.start(t); o.stop(t + seconds + 0.05);
  },
  diag: () => {
    const tr = mic && mic.stream.getAudioTracks()[0];
    const st = tr && tr.getSettings ? tr.getSettings() : {};
    return `Audio ${ctx.sampleRate} Hz${st.sampleRate ? `, microphone ${st.sampleRate} Hz` : ''}, A4 = ${S.a4}, correction ${S.calib || 0}¢.`;
  },
  setCalibration: (c) => { S.calib = (S.calib || 0) + c; save(); applySettings(); },
};

function startPractice(id) {
  const def = exerciseById(id) || THEORY_ITEMS[id];
  if (!def) return;
  stopPractice(); stopReplay();
  closeSheet();
  const opts = { level: (S.levels || {})[id] || def.defaultLevel || 'medium' };
  practiceDef = def;
  practice = def.make(env, opts);
  $('graphWrap').classList.add('exercising');
  $('exBar').hidden = false; $('exPanel').hidden = false;
  ui.title(def.title); ui.score(''); ui.question(''); ui.prompt(''); ui.answers(null); ui.buttons([]);
  setStageView('staff', true);
  if (practice.needsMic && !listening) startMic();
  practice.start();
  layoutExercise();
  render();
}
function stopPractice() {
  if (!practice) return;
  practice.stop(); stopSeq();
  practice = null; practiceDef = null;
  staff.setExercise(null);
  $('graphWrap').classList.remove('exercising');
  $('exBar').hidden = true; $('exPanel').hidden = true;
  layoutExercise();
  setStageView(S.view);
  render();
}
$('exClose').addEventListener('click', stopPractice);
$('practiceBtn').addEventListener('click', () => openMenu());

// ---------- sheets (settings, practice, key) ----------
function openSheet(title, build, { back = null } = {}) {
  setText($('sheetTitle'), title);
  $('sheetBack').hidden = !back;
  $('sheetBack').onclick = back;
  const body = $('sheetBody');
  body.textContent = '';
  body.scrollTop = 0;
  build(body);
  $('sheet').classList.add('open');
  $('sheet').setAttribute('aria-hidden', 'false');
}
function closeSheet() {
  $('sheet').classList.remove('open');
  $('sheet').setAttribute('aria-hidden', 'true');
}
$('doneBtn').addEventListener('click', closeSheet);
$('scrim').addEventListener('click', closeSheet);

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const section = (body, title) => { body.appendChild(el('div', 'section-title', title)); const g = el('div', 'group'); body.appendChild(g); return g; };

// ---------- the menu: sections → items → (level) → start ----------
const MENU = [
  { id: 'sing', icon: '🎤', title: 'Sing', blurb: 'Sight-singing, intervals, echo, pitch memory, scale & return.',
    items: () => EXERCISES.filter((x) => x.section === 'sing') },
  { id: 'ear', icon: '👂', title: 'Ear training', blurb: 'Scale degrees, chords by ear, note naming.',
    items: () => [EXERCISES.find((x) => x.id === 'degrees'), THEORY_ITEMS['quiz-chordear'], EXERCISES.find((x) => x.id === 'naming')] },
  { id: 'theory', icon: '📖', title: 'Theory', blurb: 'Keys and key signatures, finding the key, chords.', topics: () => TOPICS },
  { id: 'tools', icon: '🧰', title: 'Tools', blurb: 'Held note, drone, tuning check, record & replay.',
    items: () => EXERCISES.filter((x) => x.section === 'tools'),
    extra: [
      { title: 'Drone', blurb: 'A steady home note to tune against while you sing.', open: () => openDroneDetail() },
      { title: 'Record & replay', blurb: 'Use the ● button at the top: sing, stop, then replay with the graph or staff.', open: () => closeSheet() },
    ] },
];
const menuSection = (id) => MENU.find((m) => m.id === id);

function menuRow(parent, { icon, title, blurb, tag, onClick }) {
  const r = el('button', 'ex-row menu-row');
  if (icon) r.appendChild(el('span', 'menu-ico', icon));
  const txt = el('div');
  const t = el('div', 't', title);
  if (tag) t.appendChild(el('span', 'on-tag', tag));
  txt.append(t, el('div', 'd', blurb));
  r.append(txt, el('span', 'chev', '›'));
  r.addEventListener('click', onClick);
  parent.appendChild(r);
}

function openMenu() {
  openSheet('Menu', (body) => {
    const g = el('div', 'group ex-list');
    body.appendChild(g);
    for (const m of MENU) menuRow(g, { icon: m.icon, title: m.title, blurb: m.blurb, tag: m.id === 'tools' && drone.on ? 'DRONE ON' : null, onClick: () => openSection(m.id) });
    body.appendChild(el('p', 'muted hub-hint', 'The main screen is always the pitch display and piano. Everything else lives here.'));
  });
}

function openSection(id) {
  const m = menuSection(id);
  openSheet(m.title, (body) => {
    const g = el('div', 'group ex-list');
    body.appendChild(g);
    if (m.topics) for (const topic of m.topics()) menuRow(g, { title: topic.title, blurb: topic.blurb, onClick: () => openTopicDetail(topic, id) });
    if (m.items) for (const def of m.items()) menuRow(g, { title: def.title, blurb: def.blurb, onClick: () => openItemDetail(def, () => openSection(id)) });
    for (const x of m.extra || []) menuRow(g, { title: x.title, blurb: x.blurb, tag: x.title === 'Drone' && drone.on ? 'ON' : null, onClick: x.open });
  }, { back: openMenu });
}

/** One level choice (if the item has levels) and a Start button. */
function levelPicker(parent, def) {
  if (!def.levels) return;
  const seg = el('div', 'seg');
  const cur = (S.levels || {})[def.id] || def.defaultLevel || 'medium';
  for (const [v, text] of LEVEL_NAMES) {
    const b = el('button', cur === v ? 'sel' : '', text);
    b.addEventListener('click', () => { S.levels = { ...(S.levels || {}), [def.id]: v }; save(); for (const x of seg.children) x.classList.toggle('sel', x === b); });
    seg.appendChild(b);
  }
  parent.appendChild(seg);
}

function openItemDetail(def, back) {
  openSheet(def.title, (body) => {
    body.appendChild(el('p', 'ex-detail-p', def.why || def.blurb));
    levelPicker(body, def);
    const go = el('button', 'start-ex', 'Start');
    go.addEventListener('click', () => startPractice(def.id));
    body.appendChild(go);
  }, { back });
}

function openTopicDetail(topic, sectionId) {
  openSheet(topic.title, (body) => {
    body.appendChild(el('p', 'ex-detail-p', topic.blurb));
    const learn = el('button', 'start-ex', 'Read the lesson');
    learn.addEventListener('click', () => startPractice(topic.lesson.id));
    body.appendChild(learn);
    for (const q of topic.quizzes) {
      const g = section(body, 'Quiz: ' + q.title);
      const box = el('div', 'row stack');
      box.appendChild(el('div', 'hint', q.blurb));
      levelPicker(box, q);
      const go = el('button', 'chip practice', 'Start quiz');
      go.addEventListener('click', () => startPractice(q.id));
      box.appendChild(go);
      g.appendChild(box);
    }
  }, { back: () => openSection(sectionId) });
}

function openDroneDetail() {
  openSheet('Drone', (body) => {
    const box = el('div', 'ex-detail');
    box.appendChild(el('p', null, 'A drone is a steady note that keeps sounding while you sing — here, the home note of your key (with its 5th if you like). Sing scales or a melody against it and listen: when a note is slightly out of tune you hear a slow wobble (“beats”) against the drone; when it’s in tune, the wobble smooths out. Choirs and early-music singers use drones to tune intervals by ear.'));
    body.appendChild(box);
    const g = section(body, 'Options');
    const row = el('div', 'row');
    const left = el('div'); left.append(el('div', 'label', 'Add the 5th'), el('div', 'hint', 'do + sol, like a bagpipe or shruti box'));
    const sw = el('button', 'switch'); sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', String(S.droneFifth));
    sw.addEventListener('click', () => { S.droneFifth = !S.droneFifth; save(); sw.setAttribute('aria-checked', String(S.droneFifth)); if (drone.on) setDrone(true); });
    row.append(left, sw); g.appendChild(row);
    const name = noteName(spell(droneMidi(), practiceKey()));
    const go = el('button', 'start-ex', drone.on ? 'Stop the drone' : `Start the drone (${name})`);
    go.addEventListener('click', () => { setDrone(!drone.on); closeSheet(); });
    body.appendChild(go);
    body.appendChild(el('p', 'muted', 'It keeps playing while you use the rest of the app. Tap “Drone ■” on the screen to stop it.'));
  }, { back: () => openSection('tools') });
}

function openKeySheet(back = null) {
  openSheet('Key', (body) => {
    body.appendChild(el('p', 'muted', 'Sets the key signature on the staff, how notes are spelled (F♯ or G♭), and the key used for practice and the drone.'));
    const grid = (title, keys) => {
      const g = section(body, title);
      const box = el('div', 'key-grid');
      for (const k of keys) {
        const b = el('button', (S.key === k.id ? 'sel ' : '') + (k.none ? 'wide' : ''), k.none ? 'No key (plain sharps or flats)' : k.name.replace(' major', '').replace(' minor', ' m'));
        b.addEventListener('click', () => { S.key = k.id; save(); applySettings(); if (drone.on) setDrone(true); closeSheet(); });
        box.appendChild(b);
      }
      g.appendChild(box);
    };
    grid('Major', KEYS.filter((k) => k.mode === 'major'));
    grid('Minor', KEYS.filter((k) => k.mode === 'minor'));
    grid('Other', [NO_KEY]);
  }, { back });
}
$('keyChip').addEventListener('click', () => openKeySheet());

// ---------- settings ----------
const SECTIONS = [
  { title: 'Key and staff', items: [
    { type: 'keyrow', label: 'Key' },
    { key: 'clef', type: 'choice', label: 'Clef', options: Object.entries(CLEF_VIEWS).map(([id, v]) => [id, v.label]),
      hint: 'Tenors usually read the treble clef with a small 8 below (it sounds an octave lower than written).' },
    { key: 'staffLabels', type: 'seg', label: 'Note names under the staff', options: [['names', 'C4 D4'], ['solfege', 'do re mi'], ['none', 'Off']] },
    { key: 'staffLine', type: 'toggle', label: 'Pitch line beside the note you’re singing' },
  ] },
  { title: 'Listening', items: [
    { key: 'sensitivity', type: 'slider', label: 'Mic sensitivity', min: 0, max: 1, step: 0.01,
      hint: 'Lower it if room noise shows up as a line. Raise it if quiet singing is missed.' },
    { key: 'speed', type: 'seg', label: 'Response', options: [['fast', 'Fast'], ['normal', 'Normal'], ['smooth', 'Smooth']],
      hint: 'Fast follows quick runs and ornaments; Smooth gives a calmer line and steadier note name.' },
    { key: 'a4', type: 'tuning', label: 'Tuning (A4)', hint: 'Sets the note names, the piano and the drone. 415 for Baroque pitch.' },
    { type: 'calib', label: 'Pitch correction', hint: 'Set by Menu → Tools → Tuning check, if the phone hears pitch slightly off.' },
  ] },
  { title: 'Display', items: [
    { key: 'levelStyle', type: 'seg', label: 'Octave label under the note',
      options: [['karaoke', 'mid2 A'], ['helmholtz', 'a′'], ['off', 'Off']],
      hint: 'mid2 A: karaoke style (as in Pitch Checker); middle C = mid2 C, C5 = hi C. a′: Helmholtz; middle C = c′.' },
    { key: 'flats', type: 'seg', label: 'Accidentals (when no key is set)', options: [[false, 'Sharps ♯'], [true, 'Flats ♭']] },
    { key: 'showCents', type: 'toggle', label: 'Show cents (how sharp or flat)' },
    { key: 'colorTrace', type: 'toggle', label: 'Colour by accuracy', hint: 'Green within 10 cents, yellow within 25, orange beyond.' },
    { key: 'span', type: 'seg', label: 'Graph height', options: [[12, '1 octave'], [18, '1½'], [24, '2 octaves']] },
    { key: 'window', type: 'seg', label: 'Graph length', options: [[4, '4 sec'], [7, '7 sec'], [12, '12 sec']] },
  ] },
  { title: 'Practice', items: [
    { key: 'voice', type: 'seg', label: 'Your voice', options: Object.entries(VOICES).slice(0, 3).map(([id, v]) => [id, v.label]), more: Object.entries(VOICES).slice(3).map(([id, v]) => [id, v.label]) },
    { type: 'range', label: 'Practice range', hint: 'Melodies and notes in the exercises stay inside this range.' },
    { key: 'practiceKey', type: 'seg', label: 'Keys in practice', options: [['random', 'Random'], ['mine', 'My key']],
      hint: 'Random: a new key each time. My key: the key chosen on the main screen.' },
    { key: 'strict', type: 'seg', label: 'How close counts as right', options: [['relaxed', '±50¢'], ['normal', '±35¢'], ['strict', '±20¢']],
      hint: 'Measured on the vibrato-averaged pitch, so normal vibrato is fine.' },
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
      hint: 'While the mic is on, plays the piano the way iPhone plays call audio, with an extra boost, so it isn’t turned down. If the piano sounds late or choppy while listening, turn this off.' },
    { key: 'echo', type: 'toggle', label: 'Echo cancellation',
      hint: 'Keeps the piano out of the microphone (needs Louder piano on). It can also change how your voice is picked up. Applies the next time you start listening.' },
  ] },
];

function openSettings() {
  openSheet('Settings', (body) => {
    for (const sec of SECTIONS) {
      const g = section(body, sec.title);
      for (const it of sec.items) g.appendChild(buildRow(it));
    }
    const g = section(body, 'About');
    const about = el('div', 'about');
    about.innerHTML = `Pitch Piano ${VERSION}. Your own app: no ads, no account, nothing leaves your phone.<br>
      Piano: Steinway B recordings from the Versilian Community Sample Library (CC0), Versilian Studios / Sam Gossner.<br>
      Music symbols: Bravura (SIL Open Font License), Steinberg Media Technologies.`;
    g.appendChild(about);
    const row = el('div', 'row');
    const reset = el('button', 'danger', 'Reset all settings');
    reset.addEventListener('click', () => {
      if (reset.dataset.confirm) { Object.assign(S, JSON.parse(JSON.stringify(DEFAULTS))); save(); applySettings(); openSettings(); return; }
      reset.dataset.confirm = '1'; reset.textContent = 'Tap again to reset everything';
      setTimeout(() => { delete reset.dataset.confirm; reset.textContent = 'Reset all settings'; }, 3000);
    });
    row.appendChild(reset); g.appendChild(row);
  });
}
$('setBtn').addEventListener('click', openSettings);

function buildRow(it) {
  const row = el('div');
  const label = el('div', 'label', it.label);
  const hint = it.hint ? el('div', 'hint', it.hint) : null;
  const set = (v) => { S[it.key] = v; save(); applySettings(); };

  if (it.type === 'toggle') {
    row.className = 'row';
    const left = el('div'); left.appendChild(label); if (hint) left.appendChild(hint);
    const sw = el('button', 'switch'); sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-label', it.label);
    sw.setAttribute('aria-checked', String(!!S[it.key]));
    sw.addEventListener('click', () => { set(!S[it.key]); sw.setAttribute('aria-checked', String(!!S[it.key])); });
    row.append(left, sw);
    return row;
  }
  if (it.type === 'calib') {
    row.className = 'row';
    const left = el('div'); left.append(label, hint);
    const b = el('button', 'chip', S.calib ? `${S.calib > 0 ? '+' : ''}${S.calib}¢ · Reset` : 'None');
    b.addEventListener('click', () => { if (S.calib) { S.calib = 0; save(); applySettings(); b.textContent = 'None'; } });
    row.append(left, b);
    return row;
  }
  if (it.type === 'keyrow') {
    row.className = 'row';
    const b = el('button', 'chip', currentKey().none ? 'No key' : currentKey().name);
    b.addEventListener('click', () => openKeySheet(openSettings));
    row.append(label, b);
    return row;
  }
  row.className = 'row stack';
  row.appendChild(label);
  if (it.type === 'seg') {
    const all = [...it.options, ...(it.more || [])];
    const rows = it.more ? [it.options, it.more] : [it.options];
    const segs = rows.map((opts) => {
      const seg = el('div', 'seg');
      for (const [v, text] of opts) {
        const b = el('button', S[it.key] === v ? 'sel' : '', text);
        b.addEventListener('click', () => {
          set(v);
          for (const s of segs) for (const x of s.children) x.classList.toggle('sel', x === b);
          if (it.key === 'voice') { S.rangeLow = null; S.rangeHigh = null; save(); openSettingsAt('Practice'); }
        });
        seg.appendChild(b);
      }
      row.appendChild(seg);
      return seg;
    });
    void all;
  } else if (it.type === 'choice') {
    const list = el('div', 'choice-list');
    for (const [v, text] of it.options) {
      const b = el('button', S[it.key] === v ? 'sel' : '', text);
      b.addEventListener('click', () => { set(v); for (const x of list.children) x.classList.toggle('sel', x === b); });
      list.appendChild(b);
    }
    row.appendChild(list);
  } else if (it.type === 'range') {
    const r = practiceRange();
    const line = el('div', 'range-row');
    const stepper = (which) => {
      const box = el('div', 'stepper');
      const v = el('span', 'v', spelledName(which === 'low' ? r.low : r.high));
      const change = (d) => {
        const cur = practiceRange();
        let lo = cur.low, hi = cur.high;
        if (which === 'low') lo = Math.max(21, Math.min(hi - 7, lo + d)); else hi = Math.min(108, Math.max(lo + 7, hi + d));
        S.rangeLow = lo; S.rangeHigh = hi; save();
        v.textContent = spelledName(which === 'low' ? lo : hi);
      };
      const minus = el('button', null, '−'), plus = el('button', null, '+');
      minus.addEventListener('click', () => change(-1)); plus.addEventListener('click', () => change(1));
      box.append(minus, v, plus);
      return box;
    };
    line.append(el('span', 'muted', 'Low'), stepper('low'), el('span', 'muted', 'High'), stepper('high'));
    row.appendChild(line);
  } else if (it.type === 'slider') {
    const r = document.createElement('input');
    Object.assign(r, { type: 'range', min: it.min, max: it.max, step: it.step, value: S[it.key], className: 'slider' });
    r.setAttribute('aria-label', it.label);
    r.addEventListener('input', () => set(+r.value));
    row.appendChild(r);
  } else if (it.type === 'tuning') {
    const wrap = el('div', 'tuning');
    const minus = el('button', 'step', '−'), plus = el('button', 'step', '+');
    const val = el('div', 'val');
    const presets = el('div', 'presets');
    const show = () => {
      val.textContent = `${S.a4} Hz`;
      for (const b of presets.children) b.classList.toggle('sel', +b.dataset.hz === S.a4);
    };
    for (const p of A4_PRESETS) {
      const b = el('button', null, `${p.hz} ${p.label}`); b.dataset.hz = p.hz;
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
/** Rebuild settings (e.g. after the voice changes the range) and scroll back to a section. */
function openSettingsAt(title) {
  openSettings();
  const t = [...$('sheetBody').querySelectorAll('.section-title')].find((x) => x.textContent === title);
  if (t) $('sheetBody').scrollTop = t.offsetTop - 8;
}

function applySettings() {
  tracker.a4 = S.a4; tracker.calib = S.calib || 0; tracker.setSensitivity(S.sensitivity); tracker.setSpeed(S.speed);
  hold.hold = (SPEEDS[S.speed] || SPEEDS.normal).hold;
  piano.a4 = S.a4; piano.setVolume(S.volume);
  if (drone.on && drone.a4 !== S.a4) drone.retune(S.a4);
  Object.assign(graph, { span: S.span, window: S.window, flats: S.flats, colorize: S.colorTrace, showTargets: S.showTargets, dirty: true });
  staff.configure({ view: S.clef, key: currentKey(), flats: S.flats, labels: S.staffLabels, pitchLine: S.staffLine });
  keyboard.setLabels(S.keyLabels, S.flats);
  const w = KEY_SIZES[S.keySize] || 44;
  if (w !== keyboard.whiteW) keyboard.setKeyWidth(w);
  if (!S.highlight) keyboard.setSung(null, '');
  if (listening) piano.useCallAudio(S.callAudio);
  renderReadout(listening && vt - lastVoiced < 0.3);
  renderRange();
  render();
}

// ---------- first visit in Safari: how to install ----------
const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (iOS && !standalone && !store.get('tipDismissed', false)) $('installTip').hidden = false;
$('tipClose').addEventListener('click', () => { $('installTip').hidden = true; store.set('tipDismissed', true); });

// ---------- offline support ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // When an update has downloaded, switch to it right away unless you're in the middle of something.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !listening && !practice && !recorder.recording && !keyboard.held.size && !reloading) { reloading = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

applySettings();
setStageView(S.view);
requestAnimationFrame(loop);

// handle for automated checks
window.__pp = {
  S, graph, staff, keyboard, piano, drone, recorder, tracker, ctx, VERSION,
  get listening() { return listening; }, get shown() { return shown; }, get range() { return range; },
  get practice() { return practice; }, get playing() { return playing; }, get take() { return recTake; }, get replaying() { return !!replay; },
  startMic, stopMic, startPractice, stopPractice, setDrone, toggleRecord, startReplay, stopReplay, openSettings, openMenu, openSection,
  setKey: (id) => { S.key = id; save(); applySettings(); },
  set: (k, v) => { S[k] = v; save(); applySettings(); },
};
