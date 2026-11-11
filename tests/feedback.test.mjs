import test from 'node:test';
import assert from 'node:assert/strict';
import { pitchStats, rhythmStats, describe, tipsFor, dailyTrend } from '../js/feedback.js';
import { TIPS } from '../js/tips.js';
import { Transcriber } from '../js/analysis.js';
import { Exercise } from '../js/practice.js';

const P = (midi, cents, extra = {}) => ({ kind: 'pitch', midi, cents, ...extra });

test('pitch summary: average, spread, register and scoops', () => {
  const log = [
    ...[50, 51, 52, 53].map((m) => P(m, -10, { scoop: 5 })),
    ...[57, 58, 59, 60].map((m) => P(m, -20, { scoop: 40 })),
    ...[64, 65, 66, 67].map((m) => P(m, -36, { scoop: 40 })),
    { kind: 'wrong' },
  ];
  const s = pitchStats(log);
  assert.equal(s.n, 12); assert.equal(s.mean, -22); assert.equal(s.wrong, 1);
  assert.equal(s.high.mean, -36); assert.equal(s.low.mean, -10);
  assert.deepEqual(s.scoops, { n: 8, of: 12, size: 40 });
  const lines = describe(log, { name: (m) => 'n' + m });
  assert.match(lines[0], /22¢ flat on average/);
  assert.ok(lines.some((l) => /Higher notes \(n64 and up\) −36¢; lower notes \(up to n53\) −10¢/.test(l)));
  assert.ok(lines.some((l) => /Scooped into 8 of 12/.test(l)));
  const tips = tipsFor(log, 3);
  assert.equal(tips.length, 3);
  assert.equal(tips[0], TIPS.flat);
  assert.equal(tips[2], TIPS.listenBack); // always kept when pitch needs work
});

test('good pitch gets a good word, not a correction', () => {
  const log = [60, 62, 64, 65, 67, 69].map((m, i) => P(m, i % 2 ? 4 : -6));
  assert.deepEqual(tipsFor(log), [TIPS.pitchGood]);
});

test('rhythm summary and tips: rushing, misses, early after rests, short notes', () => {
  const att = { kind: 'rhythm', notes: 10, onTime: 6, offs: [-60, -50, -45, -70, -40, -55, -65, -50], sd: 9, missed: 1, extra: 1, earlyAfterRest: 1, rests: 2, judged: 4, short: 2, long: 0, tol: 70 };
  const r = rhythmStats([att, att]);
  assert.equal(r.attempts, 2); assert.equal(r.notes, 20); assert.equal(r.mean, -54); assert.equal(r.short, 4);
  const lines = describe([att]);
  assert.match(lines[0], /60% on time/); assert.match(lines[0], /54 ms early/);
  assert.match(lines[1], /1 missed · 1 extra tap · early after a rest 1 time · lengths: 2 cut short/);
  const tips = tipsFor([att], 5);
  assert.deepEqual(tips, [TIPS.rush, TIPS.rests, TIPS.subdivide, TIPS.holdFull]);
});

test('daily trend needs three days, and weights each day by how much was sung', () => {
  const h = (day, n, mean) => ({ day, pitch: { n, mean } });
  assert.equal(dailyTrend([h('2026-11-01', 10, -30), h('2026-11-02', 10, -25)]), null);
  assert.equal(dailyTrend([h('2026-11-01', 10, -30), h('2026-11-02', 10, -24), h('2026-11-02', 30, -16), h('2026-11-03', 20, -12)]),
    'Average pitch on your last 3 practice days: −30¢ → −18¢ → −12¢.');
});

test('transcriber: a dropout of a frame or two doesn’t restart a note; a breath does', () => {
  const tr = new Transcriber({ minHold: 0.45, skip: 0.15 });
  const writes = [];
  const feed = (t, n, c) => { const e = tr.feed(t, n, c); if (e && e.type === 'write') writes.push(e); };
  for (let t = 0; t <= 0.3; t += 1 / 60) feed(t, 60, -10);
  feed(0.32, null, 0); feed(0.34, null, 0);                     // two missing frames
  for (let t = 0.36; t <= 0.5; t += 1 / 60) feed(t, 60, -10);
  assert.equal(writes.length, 1); assert.equal(writes[0].since, 0); // same note, written at 0.45 s
  tr.feed(0.6, null, 0); tr.feed(0.7, null, 0);               // a real breath
  const again = tr.feed(0.72, 60, 0);
  assert.equal(again, null);                                  // a new note, not yet long enough
});

test('the right note sung a bit out of tune moves on once it settles in tune (the ✓ that didn’t advance)', () => {
  class OneNote extends Exercise {
    constructor(env) { super(env); this.targets = [{ midi: 60 }, { midi: 60 }]; this.i = 0; this.accepted = []; }
    expecting() { return this.targets[this.i] || null; }
    held(note, cents) { const t = this.expecting(); if (t && note === t.midi && Math.abs(cents) <= this.tol) { this.accepted.push(cents); this.i++; } }
  }
  const env = { tol: () => 35, ui: {}, log: () => {} };
  const ex = new OneNote(env);
  // scoops in from -60, settles at -40 by the time it's first judged (too flat), then at -20 (in tune)
  let t = 0;
  for (; t < 0.15; t += 1 / 60) ex.frame(t, 60, -60);
  for (; t < 0.6; t += 1 / 60) ex.frame(t, 60, -40);
  assert.equal(ex.i, 0, 'not in tune yet');
  for (; t < 1.2; t += 1 / 60) ex.frame(t, 60, -20);
  assert.equal(ex.i, 1, 'accepted while still holding, without having to stop and sing it again');
  assert.ok(ex.accepted[0] >= -35 && ex.accepted[0] < -20, `judged on where it settled (${ex.accepted[0]})`);
  for (; t < 2.0; t += 1 / 60) ex.frame(t, 60, -20);
  assert.equal(ex.i, 1, 'the same held note doesn’t also count for the next (repeated) note');
  for (let k = 0; k < 10; k++, t += 1 / 60) ex.frame(t, null, 0); // a breath, then sing it again
  for (let k = 0; k < 40; k++, t += 1 / 60) ex.frame(t, 60, -15);
  assert.equal(ex.i, 2);
});
