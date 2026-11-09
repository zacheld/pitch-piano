// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transcriber, analyzeHeldNote } from '../js/analysis.js';

test('transcriber writes a note once it has been held, then only updates it', () => {
  const tr = new Transcriber({ minHold: 0.25 });
  const out = [];
  for (let i = 0; i < 40; i++) out.push(tr.feed(i / 60, 64, 5));
  const writes = out.filter((e) => e && e.type === 'write');
  assert.equal(writes.length, 1);
  assert.ok(Math.abs(writes[0].since) < 1e-9);
  assert.equal(out[10], null, 'not yet written at 0.17 s');
  assert.equal(out[39].type, 'update');
  tr.feed(1, null, 0);                 // a breath
  for (let i = 0; i < 20; i++) tr.feed(1.1 + i / 60, 64, 0);
  assert.equal(tr.feed(1.5, 64, 0).type, 'update', 'the same note again after a breath is written again');
});

// ~60 frames/s of a held note: centre = mean pitch, line = centre + vibrato
function heldNote({ note = 64, seconds = 3, rate = 5.8, extentCents = 60, driftCents = 0, offsetCents = 0, noise = 2 }) {
  const frames = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let i = 0; i < seconds * 60; i++) {
    const t = i / 60;
    const centre = note + (offsetCents + driftCents * (t / seconds - 0.5)) / 100;
    const m = centre + (extentCents / 100) * Math.sin(2 * Math.PI * rate * t) + (noise / 100) * rnd();
    frames.push({ t, m, c: centre });
  }
  return frames;
}

test('held note: classical vibrato rate and extent are measured', () => {
  for (const [rate, ext] of [[5.2, 45], [5.8, 60], [6.6, 90]]) {
    const r = analyzeHeldNote(heldNote({ rate, extentCents: ext }));
    assert.ok(r.vibrato, `vibrato found (${rate} Hz)`);
    assert.ok(Math.abs(r.rate - rate) <= 0.3, `rate ${r.rate} vs ${rate}`);
    assert.ok(Math.abs(r.extent - ext) <= ext * 0.2, `extent ${r.extent} vs ${ext}`);
  }
});

test('held note: tuning offset and drift', () => {
  const r = analyzeHeldNote(heldNote({ offsetCents: 12, driftCents: -20 }));
  assert.equal(r.note, 64);
  assert.ok(Math.abs(r.meanCents - 12) <= 3, `mean ${r.meanCents}`);
  assert.ok(Math.abs(r.drift - -15) <= 6, `drift ${r.drift} (middle 76% of a −20 cent drift)`);
});

test('held note: a straight tone (early-music style) reports no vibrato', () => {
  const r = analyzeHeldNote(heldNote({ extentCents: 0, noise: 3 }));
  assert.equal(r.vibrato, false);
  assert.equal(r.rate, null);
});

test('transcriber can leave the start of a note (the scoop into it) out of the tuning average', () => {
  const tr = new Transcriber({ minHold: 0.45, skip: 0.15 });
  const evs = [];
  for (let i = 0; i < 30; i++) { const t = i / 60; const e = tr.feed(t, 64, t < 0.15 ? -60 : 3); if (e) evs.push(e); }
  const ev = evs.find((e) => e.type === 'write');
  assert.ok(ev, 'written once held 0.45 s');
  assert.ok(Math.abs(ev.cents - 3) <= 1, `average ${ev.cents} should ignore the −60¢ scoop`);
});
