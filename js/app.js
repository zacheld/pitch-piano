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
import { RHYTHM } from './rhythm.js';
import { loadChorales, PartSinging, PARTS, choraleLabel, choraleBlurb } from './partsing.js';
import { WARMUPS } from './warmup.js';
import { EARLY } from './early.js';
import { Drone } from './drone.js';
import { Recorder } from './recorder.js';

const VERSION = '1.9.0';
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
  counting: 'numbers', tapOffset: 0, micLatency: null, hideLive: false, planLength: 20,
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
document.addEventListener('touchstart', (e) => { if (!e.target.closest('button, input, select, .scroll, .scrim')) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- problems: kept so Settings → Microphone status can show what went wrong on the phone ----------
const problems = store.get('problems', []);
function noteProblem(msg) {
  msg = String(msg).slice(0, 160);
  const last = problems[problems.length - 1];
  if (last && last.m === msg) { last.n = (last.n || 1) + 1; } else problems.push({ t: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), m: msg });
  while (problems.length > 6) problems.shift();
  store.set('problems', problems);
}
window.addEventListener('error', (e) => noteProblem(`${e.message} (${String(e.filename || '').split('/').pop()}:${e.lineno})`));
window.addEventListener('unhandledrejection', (e) => noteProblem('Promise: ' + (e.reason && (e.reason.message || e.reason))));

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
const wake = () => {
  if (synthOpen) return; // the chord synth has its own sound; this app's stays paused under it
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  if (piano.route === 'stream' && piano.el && piano.el.paused) { const p = piano.el.play(); if (p && p.catch) p.catch(() => {}); }
};
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(ev, wake, { capture: true, passive: true });

// ---------- state ----------
const tracker = new PitchTracker({ a4: S.a4, sensitivity: S.sensitivity, speed: S.speed });
const hold = new NoteHold();
const transcriber = new Transcriber({ minHold: 0.25, skip: 0.12 });
let mic = null, listening = false, paused = false, starting = false;
let synthOpen = false;       // the chord synth is covering the app (see openSynth)
let micLevel = 0, micDb = -120;           // input level, for the ring on the mic button and the status panel
let deadSince = null, micRestartAt = 0, micWarned = false; // watchdog: a live mic is never perfectly silent or frozen
const lastSamples = new Float32Array(3);
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
graph.nameOf = (m) => spelledName(m, graph.keyOverride || currentKey());
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
  const attempt = ++micAttempt;
  piano.useCallAudio(S.callAudio); // must happen inside the tap, before any waiting
  setSession('play-and-record');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: S.echo, noiseSuppression: false, autoGainControl: false },
    });
    if (attempt !== micAttempt) { for (const t of stream.getTracks()) t.stop(); return; } // cancelled meanwhile
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
    const sink = ctx.createGain(); sink.gain.value = 0; // keeps the analyser running; makes no sound
    src.connect(analyser); analyser.connect(sink); sink.connect(ctx.destination);
    mic = { stream, src, analyser, sink, buf: new Float32Array(analyser.fftSize), det: new PitchDetector({ sampleRate: ctx.sampleRate, size: analyser.fftSize }) };
    for (const t of stream.getAudioTracks()) {
      t.addEventListener('ended', () => { noteProblem('The microphone was ended by the phone'); stopMic(); });
      t.addEventListener('mute', () => noteProblem('The phone paused the microphone'));
    }
    tracker.reset(); hold.reset(); transcriber.reset();
    shown = null; deadSince = null; micWarned = false;
    listening = true; paused = false;
    showMsg(null);
  } catch (err) {
    if (attempt !== micAttempt) return;
    piano.useCallAudio(false);
    setSession('playback');
    noteProblem('Microphone didn’t start: ' + (err && (err.name + ' ' + (err.message || '')) || 'error'));
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    showMsg(denied
      ? 'Microphone access is off. Tap the mic again and choose Allow. If it doesn’t ask, check Settings → Apps → Safari → Microphone.'
      : 'Couldn’t start the microphone (' + (err && err.name || 'error') + ').');
  } finally {
    if (attempt === micAttempt) { starting = false; render(); }
  }
}
let micAttempt = 0;
/** Tapping the mic while it's still starting (e.g. the permission question never came) gives up on it. */
function cancelMicStart() {
  micAttempt++; starting = false;
  piano.useCallAudio(false); setSession('playback');
  render();
}

function stopMic() {
  if (recorder.recording) stopRecording();
  if (mic) {
    for (const t of mic.stream.getTracks()) t.stop();
    try { mic.src.disconnect(); mic.analyser.disconnect(); mic.sink.disconnect(); } catch (e) { /* ok */ }
    mic = null;
  }
  listening = false; paused = false; micLevel = 0;
  piano.useCallAudio(false);
  setSession('playback');
  render();
}
function restartMic() { stopMic(); startMic(); }

// Leaving the app with the mic on used to leave the sound dead on return (iOS pauses the capture and
// the call-audio path). So the mic is released when the app goes to the background; tap the mic to
// turn it back on. (It used to restart by itself on the next touch, which could start it twice.)
let micOffWhileAway = false;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (listening) { micOffWhileAway = true; stopMic(); }
    return;
  }
  if (ctx.state !== 'running' && !synthOpen) ctx.resume().catch(() => {});
  if (micOffWhileAway) { micOffWhileAway = false; showMsg('The mic turns off when you leave the app. Tap the mic to turn it back on.'); }
});

// ---------- readout ----------
function renderReadout(voiced) {
  const hint = starting ? 'Starting the mic…'
    : !listening && !replay ? 'Tap the mic to start'
    : practice && S.hideLive ? 'Your pitch shows after each note'
    : shown === null ? 'Listening… sing a note' : null;
  $('readout').classList.toggle('hint', !!hint);
  $('readout').classList.toggle('idle', !voiced && !hint);
  if (hint) {
    setText($('rNote'), hint); setText($('rLevel'), ''); setText($('rHz'), ''); setText($('rCents'), '');
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
  renderReadout(listening && vt - lastVoiced < 0.3);
  $('micBtn').classList.toggle('on', listening);
  $('micBtn').classList.toggle('starting', starting);
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

$('micBtn').addEventListener('click', () => { if (starting) cancelMicStart(); else if (listening) stopMic(); else startMic(); });
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
let lastTs = performance.now(), lastDetect = 0, lastLoopError = '';
// The next frame is requested first, so one bad frame can never stop the display for good.
function loop(ts) {
  requestAnimationFrame(loop);
  if (synthOpen) { lastTs = ts; return; } // the chord synth covers the screen
  try { frame(ts); } catch (e) {
    const msg = `${e && e.message} @ ${String(e && e.stack || '').split('\n')[1] || ''}`.replace(/https?:[^ )]*\//g, '');
    if (msg !== lastLoopError) { lastLoopError = msg; noteProblem('Display: ' + msg); console.error(e); }
  }
}

/** Watchdog: a working microphone always has a little noise and always changes. Perfect silence or a
 *  frozen buffer for a few seconds means iOS has stopped feeding it: restart it once, then say so. */
function checkMic(ts, buf) {
  let peak = 0;
  for (let i = 0; i < buf.length; i += 4) { const a = Math.abs(buf[i]); if (a > peak) peak = a; }
  const frozen = buf[0] === lastSamples[0] && buf[777] === lastSamples[1] && buf[buf.length - 1] === lastSamples[2];
  lastSamples[0] = buf[0]; lastSamples[1] = buf[777]; lastSamples[2] = buf[buf.length - 1];
  if (peak > 1e-7 && !frozen) { deadSince = null; if (micRestartAt && ts - micRestartAt > 10000) micRestartAt = 0; return; }
  if (deadSince == null) { deadSince = ts; return; }
  if (ts - deadSince < 2500) return;
  deadSince = ts;
  if (ctx.state !== 'running') {
    ctx.resume().catch(() => {});
    noteProblem(`Audio was ${ctx.state} while listening`);
    showMsg('Tap anywhere to turn the sound back on.');
  } else if (!micRestartAt) {
    micRestartAt = ts;
    noteProblem(peak <= 1e-7 ? 'Mic sent only silence; restarted it' : 'Mic input froze; restarted it');
    setTimeout(restartMic, 0); // not in the middle of this frame
  } else if (!micWarned) {
    micWarned = true;
    noteProblem('Mic still silent after a restart');
    showMsg('The microphone isn’t picking up any sound. Turn the mic off and on. If that doesn’t help, close Pitch Piano completely (swipe it away) and open it again.');
  }
}

function frame(ts) {
  const raw = Math.max(0, (ts - lastTs) / 1000);
  const dt = Math.min(0.1, raw); // for animations
  lastTs = ts;
  // the app clock keeps real time through slow frames (so it stays in step with the audio clock);
  // only a long gap (the app was in the background) is skipped
  if (!paused) vt += raw > 0.5 ? dt : raw;

  if (listening && !paused && mic && !replay && ts - lastDetect >= 14) { // ~60 analyses a second, even on 120 Hz screens
    lastDetect = ts;
    mic.analyser.getFloatTimeDomainData(mic.buf);
    checkMic(ts, mic.buf);
    const res = mic.det.detect(mic.buf);
    micDb = 20 * Math.log10(res.rms + 1e-9);
    micLevel = Math.max(Math.min(1, Math.max(0, (micDb + 60) / 45)), micLevel - 0.06);
    const o = tracker.push(res, vt);
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

  const live = (listening || replay) && !paused && vt - lastVoiced < 0.3 && !(practice && S.hideLive) ? shown : null;
  if (!paused) {
    graph.current = live;
    graph.follow(live, dt);
    const cls = live == null ? '' : Math.abs(shownCents) <= 60 ? accuracyClass(shownCents) : keyboard.sungClass;
    keyboard.setSung(S.highlight ? live : null, cls);
    if (S.followKeys && live != null) keyboard.follow(live);
  }
  if (stageView === 'graph' && graph.active(vt)) graph.draw(vt);
  if (stageView === 'staff' && (staff.active() || (live != null && S.staffLine))) staff.draw(vt, dt);
  // the ring around the mic button follows what the mic hears
  const ring = listening && !paused ? Math.round(micLevel * 20) / 20 : 0;
  if (ring !== lastRing) { lastRing = ring; $('micBtn').style.setProperty('--lvl', ring); }
}
let lastRing = -1;

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
  graph.padTop = staff.padTop = practice ? $('exBar').offsetHeight : 0;
  graph.padBottom = staff.padBottom = practice ? $('exPanel').offsetHeight : 0;
  staff.dirty = true; graph.dirty = true;
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
  startById: (id) => startPractice(id),  // keeps the same ‹ back target
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
  now: () => ctx.currentTime,
  click: (t, accent = false, sub = false) => {
    const o = ctx.createOscillator(), a = ctx.createGain();
    o.type = 'square'; o.frequency.value = accent ? 1760 : sub ? 880 : 1320;
    const v = sub ? 0.08 : accent ? 0.28 : 0.2;
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(v, t + 0.002); a.gain.exponentialRampToValueAtTime(0.0008, t + 0.05);
    o.connect(a).connect(piano.out); o.start(t); o.stop(t + 0.06);
  },
  wood: (t) => {
    const o = ctx.createOscillator(), a = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.08);
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.5, t + 0.003); a.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(a).connect(piano.out); o.start(t); o.stop(t + 0.16);
  },
  noteAt: (m, t, dur, gain = 1) => piano.playAt(m, t, dur, gain),
  stopScheduled: () => piano.stopScheduled(),
  hideLive: () => !!S.hideLive,
  droneOn: (m, fifth) => { drone.start(m, { fifth, a4: S.a4 }); render(); },
  droneOff: () => { drone.stop(); render(); },
  freqOf: (m) => midiToFreq(m, S.a4),
  toneHz: (hz, seconds) => {
    const o = ctx.createOscillator(), a = ctx.createGain(), t = ctx.currentTime;
    o.frequency.value = hz;
    a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(0.3, t + 0.05); a.gain.setValueAtTime(0.3, t + seconds - 0.1); a.gain.linearRampToValueAtTime(0, t + seconds);
    o.connect(a).connect(piano.out); o.start(t); o.stop(t + seconds + 0.05);
  },
  graph,
  vtOf: (audioT) => vt + (audioT - ctx.currentTime),
  pad: (show) => { $('tapPad').hidden = !show; layoutExercise(); },
  animate: (on) => { if (staff.exercise) staff.exercise.animate = on; staff.dirty = true; },
  syllables: () => S.counting,
  tapOffset: () => S.tapOffset || 0,
  setTapOffset: (ms) => { S.tapOffset = ms; save(); },
  micLatency: () => S.micLatency,
  setMicLatency: (ms) => { S.micLatency = ms; save(); },
};
// The tap pad: the time of a touch, converted to the audio clock (touch is near-instant).
$('tapPad').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  wake();
  const t = ctx.currentTime - Math.max(0, (performance.now() - e.timeStamp) / 1000);
  if (practice && practice.tap) practice.tap(t);
  $('tapPad').classList.add('hit'); setTimeout(() => $('tapPad').classList.remove('hit'), 90);
});

let practiceFrom = null; // the menu section an exercise was started from (its ‹ back button returns there)
function startPractice(id, { keepPlan = false, from } = {}) {
  let def = exerciseById(id) || THEORY_ITEMS[id] || RHYTHM.find((x) => x.id === id) || WARMUPS.find((x) => x.id === id) || EARLY.find((x) => x.id === id);
  if (!def && id.startsWith('chorale:')) {
    const c = (chorales || []).find((x) => x.id === id.slice(8));
    if (c) def = { id: 'partsing', title: 'Part-singing', make: (e, o) => new PartSinging(e, { ...o, chorale: c, part: S.part || partFor(), view: S.partView || 'all' }) };
  }
  if (!def) return;
  const keep = plan, keepFrom = practiceFrom;
  stopPractice(); stopReplay();
  if (keepPlan) plan = keep;
  practiceFrom = from !== undefined ? from : keepFrom;
  const sec = practiceFrom && menuSection(practiceFrom);
  setText($('exBack'), '‹ ' + (sec ? sec.short || sec.title : 'Menu'));
  closeSheet();
  const opts = { level: (S.levels || {})[def.id || id] || def.defaultLevel || 'medium' };
  practiceDef = def;
  practice = def.make(env, opts);
  $('graphWrap').classList.add('exercising'); $('app').classList.add('exercising');
  $('exBar').hidden = false; $('exPanel').hidden = false;
  ui.title(def.title); ui.score(''); ui.question(''); ui.prompt(''); ui.answers(null); ui.buttons([]);
  setStageView('staff', true);
  if (practice.needsMic && !listening) startMic();
  practice.start();
  layoutExercise();
  render();
}
function stopPractice() {
  plan = null; $('exNext').hidden = true;
  if (!practice) return;
  practice.stop(); stopSeq(); piano.stopScheduled();
  graph.script = []; graph.lookahead = 0; graph.keyOverride = null;
  $('tapPad').hidden = true;
  practice = null; practiceDef = null;
  staff.setExercise(null);
  $('graphWrap').classList.remove('exercising'); $('app').classList.remove('exercising');
  $('exBar').hidden = true; $('exPanel').hidden = true;
  layoutExercise();
  setStageView(S.view);
  render();
}
$('exClose').addEventListener('click', () => { closeSheet(); stopPractice(); });
$('exBack').addEventListener('click', () => { const from = practiceFrom; stopPractice(); if (from) openSection(from); else openMenu(); });
$('practiceBtn').addEventListener('click', () => openMenu());

// ---------- daily practice plan ----------
const PLAN_QUIZZES = ['quiz-keysig', 'hearrhythm', 'quiz-roman', 'quiz-majmin', 'degrees'];
const today = () => new Date().toISOString().slice(0, 10);
function planSteps(len) {
  const k = len / 20, day = Math.floor(Date.now() / 86400000);
  return [
    { id: day % 2 ? 'wu-straw' : 'wu-five', min: 3 * k }, { id: 'match', min: 3 * k }, { id: 'scale', min: 2 * k },
    { id: 'sight', min: 5 * k }, { id: 'tap', min: 3 * k }, { id: PLAN_QUIZZES[day % PLAN_QUIZZES.length], min: 2 * k }, { id: 'wu-cool', min: 2 * k },
  ];
}
const defOf = (id) => exerciseById(id) || THEORY_ITEMS[id] || RHYTHM.find((x) => x.id === id) || WARMUPS.find((x) => x.id === id) || EARLY.find((x) => x.id === id);
function streak() {
  const days = new Set(store.get('plan.days', []));
  let n = 0;
  for (let d = new Date(); days.has(d.toISOString().slice(0, 10)); d.setDate(d.getDate() - 1)) n++;
  return { n, total: days.size };
}
function buildPlanPage(body, g) {
  g.remove();
  body.appendChild(el('p', 'ex-detail-p', 'A short guided session in the order voice teachers recommend: general to specific, with a cool-down. Each step suggests a time; tap Next › when you’re ready to move on.'));
  const lenG = section(body, 'Session length');
  const row = el('div', 'row stack');
  const seg = el('div', 'seg');
  const list = el('div', 'group');
  const showSteps = () => {
    list.textContent = '';
    for (const st of planSteps(S.planLength)) {
      const r = el('div', 'row');
      r.append(el('div', 'label', defOf(st.id).title), el('span', 'muted', `${Math.round(st.min)} min`));
      list.appendChild(r);
    }
  };
  for (const [v, t] of [[10, '10 min'], [20, '20 min'], [30, '30 min']]) {
    const b = el('button', S.planLength === v ? 'sel' : '', t);
    b.addEventListener('click', () => { S.planLength = v; save(); for (const x of seg.children) x.classList.toggle('sel', x === b); showSteps(); });
    seg.appendChild(b);
  }
  row.appendChild(seg); lenG.appendChild(row);
  body.appendChild(el('div', 'section-title', 'Today'));
  body.appendChild(list);
  showSteps();
  const s = streak();
  body.appendChild(el('p', 'muted hub-hint', s.total ? `Streak: ${s.n} day${s.n === 1 ? '' : 's'} · ${s.total} day${s.total === 1 ? '' : 's'} practised in all.` : 'Your streak starts with your first session.'));
  const go = el('button', 'start-ex', 'Start today’s session');
  go.addEventListener('click', startPlan);
  body.appendChild(go);
}
let plan = null;
function startPlan() { plan = { steps: planSteps(S.planLength), i: 0 }; runPlanStep(); }
function runPlanStep() {
  const st = plan.steps[plan.i];
  startPractice(st.id, { keepPlan: true, from: 'daily' });
  plan.end = Date.now() + st.min * 60000;
  $('exNext').hidden = false;
  $('exNext').textContent = plan.i < plan.steps.length - 1 ? 'Next ›' : 'Finish';
  planTick();
}
function planTick() {
  if (!plan || !practiceDef) return;
  const left = Math.max(0, Math.round((plan.end - Date.now()) / 1000));
  setText($('exTitle'), `${plan.i + 1}/${plan.steps.length} · ${left ? fmtTime(left) : 'time!'} · ${practiceDef.title}`);
}
setInterval(planTick, 1000);
$('exNext').addEventListener('click', () => {
  if (!plan) return;
  plan.i++;
  if (plan.i < plan.steps.length) return runPlanStep();
  const days = new Set(store.get('plan.days', [])); days.add(today()); store.set('plan.days', [...days]);
  plan = null; stopPractice();
  const s = streak();
  openSheet('Session complete', (body) => {
    body.appendChild(el('p', 'ex-detail-p', `Nice work. That’s ${s.n} day${s.n === 1 ? '' : 's'} in a row (${s.total} in all). Short, regular sessions beat long, occasional ones.`));
    const b = el('button', 'start-ex', 'Done'); b.addEventListener('click', closeSheet); body.appendChild(b);
  });
});

// ---------- sheets (settings, practice, key) ----------
function openSheet(title, build, { back = null, backLabel = 'Back', close = 'Done' } = {}) {
  setText($('sheetTitle'), title);
  $('sheetBack').hidden = !back;
  $('sheetBack').onclick = back;
  setText($('sheetBack'), '‹ ' + backLabel);
  setText($('doneBtn'), close);
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
  { id: 'sing', title: 'Sing', blurb: 'Sight-singing, intervals, echo, pitch memory, scale & return.',
    items: () => EXERCISES.filter((x) => x.section === 'sing') },
  { id: 'ear', title: 'Ear training', short: 'Ear', blurb: 'Scale degrees, chords by ear, note naming.',
    items: () => [EXERCISES.find((x) => x.id === 'degrees'), THEORY_ITEMS['quiz-chordear'], EXERCISES.find((x) => x.id === 'naming')] },
  { id: 'daily', title: 'Daily practice', short: 'Daily', blurb: 'A guided session: warm-up, pitch, sight-singing, rhythm, theory, cool-down.', plan: true },
  { id: 'warm', title: 'Warm-ups', blurb: 'Straw routine, scales and arpeggios through your range, cool-down.', items: () => WARMUPS },
  { id: 'part', title: 'Part-singing', short: 'Chorales', blurb: 'Sing your part of a Bach chorale while the piano plays the others.', chorales: true },
  { id: 'rhythm', title: 'Rhythm', blurb: 'Learn to count, tap rhythms, hear rhythms, vowel on the beat, metronome.', items: () => RHYTHM },
  { id: 'theory', title: 'Theory', blurb: 'Keys and key signatures, finding the key, chords.', topics: () => TOPICS },
  { id: 'early', title: 'Early music', short: 'Early', blurb: 'Modes, pure intervals against a drone, old clefs.', items: () => EARLY },
  { id: 'tools', title: 'Tools', blurb: 'Held note, drone, tuning check, record & replay.',
    items: () => EXERCISES.filter((x) => x.section === 'tools'),
    extra: [
      { title: 'Drone', blurb: 'A steady home note to tune against while you sing.', open: () => openDroneDetail() },
      { title: 'Record & replay', blurb: 'Use the ● button at the top: sing, stop, then replay with the graph or staff.', open: () => closeSheet() },
    ] },
];
const menuSection = (id) => MENU.find((m) => m.id === id);

function menuRow(parent, { title, blurb, tag, onClick }) {
  const r = el('button', 'ex-row menu-row');
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
    for (const m of MENU) menuRow(g, { title: m.title, blurb: m.blurb, tag: m.id === 'tools' && drone.on ? 'DRONE ON' : null, onClick: () => openSection(m.id) });
    const g2 = el('div', 'group ex-list menu-extra');
    body.appendChild(g2);
    menuRow(g2, { title: 'Chord synth', blurb: 'An unofficial HiChord emulator: play chords, beats and loops.', onClick: openSynth });
    body.appendChild(el('p', 'muted hub-hint', 'Home (top right) goes back to the pitch display and piano.'));
  }, { close: 'Home' });
}

// ---------- chord synth: the HiChord emulator from the separate Chord-Synth project (synth/, see
// tools/sync-synth.mjs). It runs as its own page with its own sound engine, full-screen over the app; its
// Menu / Home buttons post a message back. While it's open the mic is off and this app's sound and drawing pause.
function openSynth() {
  closeSheet(); stopPractice();
  if (starting) cancelMicStart(); else if (listening) stopMic();
  synthOpen = true;
  ctx.suspend().catch(() => {});
  const f = document.createElement('iframe');
  f.src = 'synth/index.html?embed=1';
  f.title = 'Chord synth';
  f.allow = 'microphone; autoplay';
  $('synthLayer').replaceChildren(f);
  $('synthLayer').hidden = false;
}
function closeSynth(to) {
  if (!synthOpen) return;
  synthOpen = false;
  $('synthLayer').replaceChildren(); // removing its page stops its sound
  $('synthLayer').hidden = true;
  ctx.resume().catch(() => {});
  if (to === 'menu') openMenu();
  render();
}
window.addEventListener('message', (e) => {
  if (e.origin === location.origin && e.data && e.data.hichord === 'close') closeSynth(e.data.to);
});

function openSection(id) {
  const m = menuSection(id);
  openSheet(m.title, (body) => {
    const g = el('div', 'group ex-list');
    body.appendChild(g);
    if (m.topics) for (const topic of m.topics()) menuRow(g, { title: topic.title, blurb: topic.blurb, onClick: () => openTopicDetail(topic, id) });
    if (m.plan) { buildPlanPage(body, g); return; }
    if (m.chorales) {
      body.insertBefore(el('p', 'ex-detail-p', 'Pick a chorale. You’ll see your part coming in from the right, hear the other three voices on the piano, and each note turns green or orange as you sing it. Headphones help.'), g);
      if (!chorales) { g.appendChild(el('div', 'about', 'Loading…')); loadChorales().then((d) => { chorales = d; if ($('sheetTitle').textContent === m.title) openSection(id); }); }
      else for (const c of chorales) menuRow(g, { title: choraleLabel(c), blurb: choraleBlurb(c), onClick: () => openChoraleDetail(c) });
    }
    if (m.items) for (const def of m.items()) menuRow(g, { title: def.title, blurb: def.blurb, onClick: () => openItemDetail(def, id) });
    for (const x of m.extra || []) menuRow(g, { title: x.title, blurb: x.blurb, tag: x.title === 'Drone' && drone.on ? 'ON' : null, onClick: x.open });
  }, { back: openMenu, backLabel: 'Menu', close: 'Home' });
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

function openItemDetail(def, sectionId) {
  openSheet(def.title, (body) => {
    body.appendChild(el('p', 'ex-detail-p', def.why || def.blurb));
    levelPicker(body, def);
    const go = el('button', 'start-ex', 'Start');
    go.addEventListener('click', () => startPractice(def.id, { from: sectionId }));
    body.appendChild(go);
  }, { back: () => openSection(sectionId), backLabel: menuSection(sectionId).title, close: 'Home' });
}

let chorales = null;
const partFor = () => ({ bass: 'B', baritone: 'B', tenor: 'T', alto: 'A', mezzo: 'A', soprano: 'S' }[S.voice] || 'T');
function openChoraleDetail(c) {
  openSheet(choraleLabel(c), (body) => {
    body.appendChild(el('p', 'ex-detail-p', `${choraleBlurb(c)}${c.lyrics && c.lyrics.length ? ', with words' : ''}. Easy: slower, with your part played quietly as a guide. Medium: normal speed, no guide. Hard: faster.`));
    const g = section(body, 'Your part');
    const seg = el('div', 'seg');
    const cur = S.part || partFor();
    for (const [v, name] of PARTS) {
      const b = el('button', cur === v ? 'sel' : '', name);
      b.addEventListener('click', () => { S.part = v; save(); for (const x of seg.children) x.classList.toggle('sel', x === b); });
      seg.appendChild(b);
    }
    const row = el('div', 'row stack'); row.appendChild(seg); g.appendChild(row);
    const g2 = section(body, 'Show');
    const seg2 = el('div', 'seg');
    for (const [v, name] of [['all', 'All four parts'], ['mine', 'My part'], ['graph', 'Pitch graph']]) {
      const b = el('button', (S.partView || 'all') === v ? 'sel' : '', name);
      b.addEventListener('click', () => { S.partView = v; save(); for (const x of seg2.children) x.classList.toggle('sel', x === b); });
      seg2.appendChild(b);
    }
    const row2 = el('div', 'row stack'); row2.appendChild(seg2);
    row2.appendChild(el('div', 'hint', 'All four parts: the score as printed in hymn books, your part in white. My part: just your line, larger. Pitch graph: your notes as bars, with your voice as a line.'));
    g2.appendChild(row2);
    levelPicker(body, { id: 'partsing', levels: true });
    const go = el('button', 'start-ex', 'Start');
    go.addEventListener('click', () => startPractice('chorale:' + c.id, { from: 'part' }));
    body.appendChild(go);
  }, { back: () => openSection('part'), backLabel: 'Part-singing', close: 'Home' });
}

function openTopicDetail(topic, sectionId) {
  openSheet(topic.title, (body) => {
    body.appendChild(el('p', 'ex-detail-p', topic.blurb));
    const learn = el('button', 'start-ex', 'Read the lesson');
    learn.addEventListener('click', () => startPractice(topic.lesson.id, { from: sectionId }));
    body.appendChild(learn);
    for (const q of topic.quizzes) {
      const g = section(body, 'Quiz: ' + q.title);
      const box = el('div', 'row stack');
      box.appendChild(el('div', 'hint', q.blurb));
      levelPicker(box, q);
      const go = el('button', 'chip practice', 'Start quiz');
      go.addEventListener('click', () => startPractice(q.id, { from: sectionId }));
      box.appendChild(go);
      g.appendChild(box);
    }
  }, { back: () => openSection(sectionId), backLabel: menuSection(sectionId).title, close: 'Home' });
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
  }, { back: () => openSection('tools'), backLabel: 'Tools', close: 'Home' });
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
  }, { back, backLabel: 'Settings' });
}
$('keyChip').addEventListener('click', () => openKeySheet());

// ---------- settings ----------
const SECTIONS = [
  { title: 'Key and staff', items: [
    { type: 'keyrow', label: 'Key' },
    { key: 'clef', type: 'choice', label: 'Clef', options: Object.entries(CLEF_VIEWS).map(([id, v]) => [id, v.label]),
      hint: 'Tenor: the treble clef with a small 8 below, which sounds an octave lower than written.' },
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
    { type: 'status', label: 'Microphone status', hint: 'Live. If the mic is on but singing doesn’t show up, this says why. A screenshot of it helps.' },
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
    { key: 'counting', type: 'seg', label: 'Counting syllables', options: [['numbers', '1 e & a'], ['takadimi', 'ta ka di mi']],
      hint: 'Shown under rhythms. Numbers are the most common; Takadimi names each part of the beat the same way in any meter.' },
    { key: 'hideLive', type: 'seg', label: 'Show my pitch while I sing (exercises)', options: [[false, 'Live'], [true, 'After each note']],
      hint: 'Research suggests seeing feedback only afterwards builds your own ear better than watching it live.' },
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
      Music symbols: Bravura (SIL Open Font License), Steinberg Media Technologies.<br>
      Chorales: J. S. Bach (public domain), encodings from the music21 corpus.`;
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
  } else if (it.type === 'choice') { // a dropdown: iPhone shows its own picker
    const sel = el('select', 'select');
    sel.setAttribute('aria-label', it.label);
    for (const [v, text] of it.options) { const o = el('option', null, text); o.value = v; o.selected = S[it.key] === v; sel.appendChild(o); }
    sel.addEventListener('change', () => set(sel.value));
    row.appendChild(sel);
  } else if (it.type === 'status') {
    const box = el('div', 'status-box');
    const update = () => { box.innerHTML = micStatus(); };
    update();
    const timer = setInterval(() => { if (!box.isConnected || !$('sheet').classList.contains('open')) clearInterval(timer); else update(); }, 300);
    row.appendChild(box);
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
/** What the microphone is doing right now, in plain words (Settings → Listening). */
function micStatus() {
  const tr = mic && mic.stream.getAudioTracks()[0];
  const st = tr && tr.getSettings ? tr.getSettings() : {};
  const bars = Math.round(micLevel * 12);
  const lines = [];
  if (starting) lines.push('Mic: starting…');
  else if (!listening) lines.push('Mic: off. Tap the mic button (top left) to turn it on.');
  else {
    lines.push(`Mic: on${paused ? ' (paused)' : ''}${tr ? (tr.readyState !== 'live' ? ' · stopped by the phone' : tr.muted ? ' · paused by the phone' : '') : ''}`);
    lines.push(`Hearing: <span class="lvl">${'▮'.repeat(bars)}<span>${'▮'.repeat(12 - bars)}</span></span> ${micDb > -119 ? Math.round(micDb) + ' dB' : 'nothing'}`);
    lines.push(deadSince != null ? 'Getting no sound from the mic.' : micDb < -75 ? 'Very quiet: is something covering the mic?' : shown != null && vt - lastVoiced < 0.5 ? `Hearing a note: ${spelledName(shown)}` : 'Hearing sound, but no clear note.');
  }
  lines.push(`Audio: ${ctx.state} · ${ctx.sampleRate} Hz${st.sampleRate ? ` · mic ${st.sampleRate} Hz` : ''} · sensitivity ${Math.round(S.sensitivity * 100)}%${S.calib ? ` · correction ${S.calib}¢` : ''}`);
  lines.push(problems.length ? 'Recent problems:<br>' + problems.slice().reverse().map((p) => `· ${p.t}: ${p.m.replace(/</g, '&lt;')}${p.n > 1 ? ` (×${p.n})` : ''}`).join('<br>') : 'No problems recorded.');
  return lines.join('<br>');
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
  S, graph, staff, keyboard, piano, drone, recorder, tracker, ctx, VERSION, openSynth, closeSynth, get synthOpen() { return synthOpen; },
  get listening() { return listening; }, get shown() { return shown; }, get range() { return range; },
  get practice() { return practice; }, get playing() { return playing; }, get mic() { return mic; }, get starting() { return starting; }, get take() { return recTake; }, get replaying() { return !!replay; },
  startMic, stopMic, startPractice, stopPractice, setDrone, toggleRecord, startReplay, stopReplay, openSettings, openMenu, openSection,
  setKey: (id) => { S.key = id; save(); applySettings(); },
  set: (k, v) => { S[k] = v; save(); applySettings(); },
};
