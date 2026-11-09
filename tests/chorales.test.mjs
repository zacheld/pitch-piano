// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/chorales.json'), 'utf8'));

test('chorale data: four voices, in order, no overlaps, all ending together, tenor in range', () => {
  assert.ok(data.length >= 12, `${data.length} chorales`);
  for (const c of data) {
    const ends = [];
    for (const part of ['S', 'A', 'T', 'B']) {
      const ns = c.voices[part];
      assert.ok(ns && ns.length > 8, `${c.id} ${part} has notes`);
      for (let i = 1; i < ns.length; i++) assert.ok(ns[i][0] >= ns[i - 1][0] + ns[i - 1][1] - 1e-6, `${c.id} ${part}: note ${i} overlaps the one before`);
      for (const n of ns) assert.ok(n[1] > 0 && n[2] >= 36 && n[2] <= 84, `${c.id} ${part}: sane note ${JSON.stringify(n)}`);
      ends.push(ns[ns.length - 1][0] + ns[ns.length - 1][1]);
    }
    assert.ok(Math.max(...ends) - Math.min(...ends) < 1e-6, `${c.id}: voices end together (${ends.join(', ')})`);
    assert.ok(c.voices.T.every((n) => n[2] >= 48 && n[2] <= 69), `${c.id}: tenor within C3–A4`);
  }
  const withFermatas = data.filter((c) => c.voices.S.some((n) => n[3])).length;
  assert.ok(withFermatas >= data.length * 0.8, `most chorales mark their phrase-end fermatas (${withFermatas}/${data.length})`);
});

test('chorale score data: written notes match the sounding ones, bars and words line up', () => {
  const STEP = [0, 2, 4, 5, 7, 9, 11];
  for (const c of data) {
    assert.ok(c.bars.length > 4 && c.bars[0] === 0 && c.bars.every((b, i) => i === 0 || b > c.bars[i - 1]), `${c.id}: bars ascend from 0`);
    for (const part of ['S', 'A', 'T', 'B']) {
      const written = c.score[part];
      // each written note's pitch is right, and tied notes join into the merged (sounding) notes
      const notes = written.filter((n) => n[2] !== -1);
      const merged = [];
      for (const n of notes) {
        const midi = 12 * (n[4] + 1) + STEP[n[2]] + n[3];
        const last = merged[merged.length - 1];
        if (last && last.tie && last.midi === midi && Math.abs(last.q + last.d - n[0]) < 1e-6) { last.d += n[1]; last.tie = !!n[5]; }
        else merged.push({ q: n[0], d: n[1], midi, tie: !!n[5] });
      }
      const sounding = c.voices[part];
      assert.equal(merged.length, sounding.length, `${c.id} ${part}: same number of notes once ties are joined`);
      merged.forEach((m, i) => {
        assert.ok(Math.abs(m.q - sounding[i][0]) < 1e-6 && Math.abs(m.d - sounding[i][1]) < 1e-6 && m.midi === sounding[i][2], `${c.id} ${part} note ${i}`);
      });
      for (const n of written) assert.ok([0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4].some((d) => Math.abs(n[1] - d) < 1e-6), `${c.id} ${part}: drawable length ${n[1]}`);
    }
    for (const [q, text] of c.lyrics || []) assert.ok(text && c.score.S.some((n) => Math.abs(n[0] - q) < 1e-6), `${c.id}: word "${text}" sits on a soprano note`);
  }
});
