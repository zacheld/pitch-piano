// Warm-ups and cool-downs: the piano plays a pattern and you sing along, starting low and moving up by
// a semitone each time (then back down), with the notes shown on the graph ahead of time. Plus the
// straw (semi-occluded) routine described by Titze: glides, accents, then a song through the straw.
// Extra env used: env.graph · env.vtOf(audioTime) · env.noteAt · env.full() · env.range()

import { Exercise, sleep } from './practice.js';

const PATTERNS = {
  five: { name: '5-note scale', notes: [0, 2, 4, 5, 7, 5, 4, 2, 0], beat: 0.32, how: 'Sing along on “ah” or “oo”, or a lip trill.' },
  arpeggio: { name: 'Arpeggio', notes: [0, 4, 7, 12, 7, 4, 0], beat: 0.36, how: 'Sing along on “ah”, staying relaxed at the top.' },
  octave: { name: 'Octave slide', notes: [0, 12, 7, 4, 0], beat: 0.5, how: 'Leap up the octave, then come down through the chord.' },
  trill: { name: 'Lip trill or straw', notes: [0, 4, 7, 4, 0], beat: 0.5, how: 'Lip trill, tongue trill or through a straw — slide smoothly between the notes.' },
  cool: { name: 'Cool-down', notes: [7, 5, 4, 2, 0], beat: 0.5, down: true, how: 'Gently, on a hum or “oo”, a little quieter each time.' },
};

class WarmUp extends Exercise {
  start() {
    this.p = PATTERNS[this.opts.pattern];
    this.env.view('graph');
    const r = this.env.range(), f = this.env.full();
    const top = Math.max(...this.p.notes);
    // start near the bottom of the comfortable range; go up to just below the top of the voice
    this.low = this.p.down ? Math.max(f.low + 2, r.low) : r.low;
    this.high = this.p.down ? Math.min(r.high - 3, this.low + 7) : Math.min(f.high - 2, r.high + 3) - top;
    this.ui.question(`${this.p.name}: ${this.p.how}`);
    this.ui.prompt(this.p.down ? 'It starts in the middle and moves down.' : 'It starts low and moves up a semitone each time, then back down.');
    this.ui.buttons([{ id: 'go', label: 'Start', primary: true }]);
  }
  go() {
    this.stopRun();
    const keys = [];
    if (this.p.down) for (let k = this.high; k >= this.low; k--) keys.push(k);
    else { for (let k = this.low; k <= this.high; k++) keys.push(k); for (let k = this.high - 1; k >= this.low; k--) keys.push(k); }
    const beat = this.p.beat, t0 = this.env.now() + 0.4, script = [];
    let t = t0;
    for (const k of keys) {
      this.env.noteAt(k, t, 0.5, 0.45); this.env.noteAt(k + 4, t, 0.5, 0.35); this.env.noteAt(k + 7, t, 0.5, 0.35); // the chord
      t += 0.75;
      for (const n of this.p.notes) {
        this.env.noteAt(k + n, t, beat * 0.95, 0.8);
        script.push({ midi: k + n, t0: this.env.vtOf(t), t1: this.env.vtOf(t + beat), state: 'pending', inT: 0, tot: 0, csum: 0, cn: 0 });
        t += beat;
      }
      t += beat * 1.5; // breathe
    }
    this.env.graph.script = script; this.env.graph.lookahead = 2.5;
    this.script = script; this.running = true;
    this.ui.buttons([{ id: 'stop', label: '■ Stop' }]);
    this.ui.prompt('');
    this.timer = setTimeout(() => this.done(), (t - this.env.now() + 0.5) * 1000);
  }
  live(note, cents, dt, line, centre, t) {
    if (!this.running) return;
    for (const s of this.script) {
      if (s.state === 'good' || s.state === 'off') continue;
      if (t >= s.t1) {
        s.state = s.tot && s.inT / s.tot >= 0.4 ? 'good' : 'off';
        // feedback: where each note sat, from its second half (the first half is still arriving from the last note)
        if (s.cn >= 5) this.log({ kind: 'pitch', midi: s.midi, cents: Math.round(s.csum / s.cn), along: true, onPitch: +(s.inT / s.tot).toFixed(2) });
        else if (s.tot > 0) this.log({ kind: 'unsung' });
        continue;
      }
      if (t < s.t0) break;
      s.state = 'current'; s.tot += dt;
      if (centre != null && Math.abs(centre - s.midi) <= 0.6) {
        s.inT += dt;
        if (t >= s.t0 + 0.45 * (s.t1 - s.t0)) { s.csum += (centre - s.midi) * 100; s.cn++; }
      }
      break;
    }
  }
  done() { this.running = false; this.ui.prompt('Done. Ready to sing.'); this.ui.buttons([{ id: 'go', label: 'Again' }]); }
  stopRun() { clearTimeout(this.timer); this.running = false; this.env.stopScheduled(); this.env.graph.script = []; this.env.graph.lookahead = 0; }
  button(id) { if (id === 'go') this.go(); if (id === 'stop') { this.stopRun(); this.ui.buttons([{ id: 'go', label: 'Start again', primary: true }]); } }
  stop() { super.stop(); this.stopRun(); }
}

// Titze's straw routine: glides, accents, a song through the straw, then the song without it.
const STRAW = [
  { secs: 60, text: '<b>Glides.</b> Through the straw, slide from low to high and back, like a siren. Smooth and easy, not loud.' },
  { secs: 45, text: '<b>Accents.</b> Swell in pitch and loudness on a single breath: “hoo-HOO-hoo”, a few times, moving around your range.' },
  { secs: 60, text: '<b>Sing a song through the straw.</b> Any song you’re working on. Keep the airflow steady.' },
  { secs: 30, text: '<b>Now without the straw.</b> Sing the same phrase and notice how easy and buzzy it feels.' },
];
class StrawRoutine extends Exercise {
  start() { this.env.view('graph'); this.i = -1; this.ui.question('Straw routine (about 3 minutes)'); this.ui.prompt('A drinking straw (or a narrow one) is all you need. The graph shows your glides.'); this.ui.buttons([{ id: 'next', label: 'Start', primary: true }]); }
  step() {
    clearInterval(this.iv);
    this.i++;
    if (this.i >= STRAW.length) { this.ui.question('Straw routine'); this.ui.prompt('Done — your voice is warmed up.'); this.ui.buttons([{ id: 'restart', label: 'Again' }]); this.ui.score(''); return; }
    const s = STRAW[this.i];
    let left = s.secs;
    this.ui.question(`Step ${this.i + 1} of ${STRAW.length}`);
    this.ui.prompt(s.text);
    this.ui.buttons([{ id: 'next', label: this.i < STRAW.length - 1 ? 'Next step ›' : 'Finish', primary: true }]);
    const tick = () => { this.ui.score(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`); if (left-- <= 0) { clearInterval(this.iv); this.ui.prompt(s.text + '<br><span class="muted">Time’s up — move on when ready.</span>'); } };
    tick(); this.iv = setInterval(tick, 1000);
  }
  button(id) { if (id === 'next') this.step(); if (id === 'restart') { this.i = -1; this.step(); } }
  stop() { super.stop(); clearInterval(this.iv); }
}

export const WARMUPS = [
  { id: 'wu-straw', title: 'Straw routine', blurb: 'Glides, accents and a song through a straw. About 3 minutes.', why: 'Semi-occluded (straw) exercises are a gentle, efficient warm-up; this follows the routine described by voice scientist Ingo Titze.', make: (e, o) => new StrawRoutine(e, o) },
  ...Object.entries(PATTERNS).map(([key, p]) => ({ id: 'wu-' + key, title: p.name, blurb: p.down ? 'Gentle descending patterns to finish a session.' : 'Steps up through your range a semitone at a time.', why: `${p.how} The piano plays the chord, then the pattern; the notes are shown ahead of you on the graph. Uses your range from Settings → Practice.`, make: (e, o) => new WarmUp(e, { ...o, pattern: key }) })),
];
export { sleep };
