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
