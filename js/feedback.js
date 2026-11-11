// Feedback after an exercise and after a daily session: turns what the exercises logged into a short
// summary (how far off your pitch was on average, which way, where; how your rhythm sat against the
// beat) and a few tips chosen from what the numbers show. No DOM here, so tests can import it directly.
//
// Log entries (from the exercises, through env.log):
//   { kind: 'pitch', midi, cents, scoop?, first?, dir?: 'up'|'down', along?: true (sung along with the piano) }
//   { kind: 'wrong' }      a wrong note sung where a right one was expected
//   { kind: 'unsung' }     a note to sing along with that got no singing
//   { kind: 'rhythm', notes, onTime, offs: [ms], sd, missed, extra, earlyAfterRest, rests, judged, short, long, tol }

import { TIPS } from './tips.js';

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sdOf = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const r0 = (x) => Math.round(x);

/** Pitch numbers from a list of logged notes. */
export function pitchStats(entries) {
  const notes = entries.filter((e) => e.kind === 'pitch');
  if (!notes.length) return null;
  const c = notes.map((n) => n.cents);
  const s = { n: notes.length, mean: r0(mean(c)), meanAbs: r0(mean(c.map(Math.abs))), sd: r0(sdOf(c)),
    within10: r0(100 * c.filter((x) => Math.abs(x) <= 10).length / c.length),
    within25: r0(100 * c.filter((x) => Math.abs(x) <= 25).length / c.length),
    wrong: entries.filter((e) => e.kind === 'wrong').length, unsung: entries.filter((e) => e.kind === 'unsung').length };
  // register: the top and bottom thirds of what was sung, when they're far enough apart to compare
  const sorted = [...notes].sort((a, b) => a.midi - b.midi), k = Math.floor(sorted.length / 3);
  if (k >= 3 && sorted[sorted.length - 1].midi - sorted[0].midi >= 5) {
    const lo = sorted.slice(0, k), hi = sorted.slice(-k);
    s.low = { n: lo.length, mean: r0(mean(lo.map((x) => x.cents))), top: lo[lo.length - 1].midi };
    s.high = { n: hi.length, mean: r0(mean(hi.map((x) => x.cents))), from: hi[0].midi };
  }
  const up = notes.filter((n) => n.dir === 'up'), down = notes.filter((n) => n.dir === 'down');
  if (up.length >= 3 && down.length >= 3) s.dirs = { up: r0(mean(up.map((x) => x.cents))), down: r0(mean(down.map((x) => x.cents))) };
  const sc = notes.filter((n) => n.scoop != null);
  if (sc.length >= 4) {
    const big = sc.filter((n) => n.scoop >= 25);
    s.scoops = { n: big.length, of: sc.length, size: big.length ? r0(mean(big.map((x) => x.scoop))) : 0 };
  }
  return s;
}

/** Rhythm numbers from the logged tapping attempts. */
export function rhythmStats(entries) {
  const att = entries.filter((e) => e.kind === 'rhythm');
  if (!att.length) return null;
  const offs = att.flatMap((a) => a.offs);
  const sum = (k) => att.reduce((x, a) => x + (a[k] || 0), 0);
  return { attempts: att.length, notes: sum('notes'), onTime: sum('onTime'), mean: r0(mean(offs)), sd: r0(sdOf(offs)),
    missed: sum('missed'), extra: sum('extra'), earlyAfterRest: sum('earlyAfterRest'), rests: sum('rests'),
    judged: sum('judged'), short: sum('short'), long: sum('long'), tol: att[0].tol };
}

const signed = (c) => (c > 0 ? '+' : c < 0 ? '−' : '±') + Math.abs(c) + '¢';
const way = (c) => (Math.abs(c) < 5 ? 'right on average' : `${Math.abs(c)}¢ ${c < 0 ? 'flat' : 'sharp'} on average`);

/**
 * Lines of summary (HTML) for one run's log. name(midi) names a note. alongOnly: the notes were sung
 * along with the piano (warm-ups, chorales), which is said, since that's easier than singing alone.
 */
export function describe(entries, { name = (m) => String(m), right = 0, total = 0 } = {}) {
  const lines = [];
  const p = pitchStats(entries), r = rhythmStats(entries);
  if (p) {
    const along = entries.some((e) => e.kind === 'pitch' && e.along);
    lines.push(`<b>Pitch</b> (${p.n} note${p.n > 1 ? 's' : ''}${along ? ', singing along' : ''}): ${way(p.mean)} · ${p.within10}% within ±10¢, ${p.within25}% within ±25¢ · typical spread ±${p.sd}¢.`);
    if (p.high && p.low && Math.abs(p.high.mean - p.low.mean) >= 10) {
      lines.push(`Higher notes (${name(p.high.from)} and up) ${signed(p.high.mean)}; lower notes (up to ${name(p.low.top)}) ${signed(p.low.mean)}.`);
    }
    if (p.dirs && Math.abs(p.dirs.up - p.dirs.down) >= 8) lines.push(`Going up the scale ${signed(p.dirs.up)}, coming down ${signed(p.dirs.down)}.`);
    if (p.scoops && p.scoops.n >= 2) lines.push(`Scooped into ${p.scoops.n} of ${p.scoops.of} notes (starting about ${p.scoops.size}¢ under where you settled).`);
    if (p.wrong) lines.push(`${p.wrong} wrong note${p.wrong > 1 ? 's' : ''} on the way (sung, then corrected).`);
    if (p.unsung >= 3) lines.push(`${p.unsung} notes went by without singing.`);
  }
  if (r) {
    const pct = r.notes ? r0((100 * r.onTime) / r.notes) : 0;
    const lean = Math.abs(r.mean) < 15 ? 'centred on the beat' : `${Math.abs(r.mean)} ms ${r.mean < 0 ? 'early (ahead of the beat)' : 'late (behind the beat)'} on average`;
    lines.push(`<b>Rhythm</b> (${r.attempts} tr${r.attempts > 1 ? 'ies' : 'y'}, ${r.notes} notes): ${pct}% on time (±${r.tol} ms) · ${lean} · consistency ±${r.sd} ms.`);
    const more = [];
    if (r.missed) more.push(`${r.missed} missed`);
    if (r.extra) more.push(`${r.extra} extra tap${r.extra > 1 ? 's' : ''}`);
    if (r.earlyAfterRest) more.push(`early after a rest ${r.earlyAfterRest} time${r.earlyAfterRest > 1 ? 's' : ''}`);
    if (r.judged) more.push(r.short || r.long ? `lengths: ${r.short} cut short, ${r.long} held too long (of ${r.judged})` : `lengths right (${r.judged} checked)`);
    if (more.length) lines.push(more.join(' · ') + '.');
  }
  if (total) lines.push(`<b>Score</b>: ${right} of ${total}.`);
  return lines;
}

/** Up to `max` tips (HTML) for what the numbers show, most useful first. Each tip is used once per list. */
export function tipsFor(entries, max = 3) {
  const p = pitchStats(entries), r = rhythmStats(entries);
  const out = [];
  const add = (id) => { if (TIPS[id] && !out.includes(TIPS[id])) out.push(TIPS[id]); };
  let pitchIssue = false;
  if (p && p.n >= 4) {
    const flatHigh = p.high && p.low && p.high.mean - p.low.mean <= -12;
    if (p.mean <= -15) { add('flat'); pitchIssue = true; }
    if (p.mean >= 15) { add('sharp'); pitchIssue = true; }
    if (flatHigh) { add('flatHigh'); pitchIssue = true; }
    if (p.high && p.low && p.high.mean - p.low.mean >= 12) add('sharpHigh');
    if (p.dirs && p.dirs.down - p.dirs.up <= -10) { add('flatDown'); pitchIssue = true; }
    if (p.scoops && p.scoops.n / p.scoops.of >= 0.3) { add('scoop'); pitchIssue = true; }
    if (p.mean <= -20 || flatHigh) add('support');
    if (p.sd >= 20 && Math.abs(p.mean) < 15) { add('spread'); pitchIssue = true; }
    if (Math.abs(p.mean) < 10 && p.within25 >= 80) add('pitchGood');
  }
  if (r && r.notes >= 6) {
    if (r.mean <= -30) add('rush');
    if (r.mean >= 30) add('drag');
    if (r.earlyAfterRest >= 1) add('rests');
    if (r.missed + r.extra >= 2) add('subdivide');
    if (r.short >= 1) add('holdFull');
    if (r.long >= 1) add('release');
    if (r.sd >= 45) add('steady');
  }
  if (max <= 0) return [];
  // listening back is the best-supported pitch habit there is: worth a mention when pitch needs work, as long
  // as there's room for it after the most specific tip
  if (pitchIssue && max >= 2) return [...out.slice(0, max - 1), TIPS.listenBack];
  return out.slice(0, max);
}

/** One line for the history (kept to show trends across sessions). */
export function historyEntry(entries, extra = {}) {
  const p = pitchStats(entries), r = rhythmStats(entries);
  return { ...extra, pitch: p ? { n: p.n, mean: p.mean, meanAbs: p.meanAbs } : null, rhythm: r ? { notes: r.notes, mean: r.mean, sd: r.sd, onTime: r.onTime } : null };
}

/** "Average pitch on your last 4 practice days: −27¢ → −24¢ → −18¢ → −15¢" (needs 3+ days with 5+ notes). */
export function dailyTrend(history) {
  const days = new Map();
  for (const h of history) {
    if (!h.pitch || !h.day) continue;
    const d = days.get(h.day) || { n: 0, sum: 0 };
    d.n += h.pitch.n; d.sum += h.pitch.mean * h.pitch.n;
    days.set(h.day, d);
  }
  const list = [...days.entries()].filter(([, d]) => d.n >= 5).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-6);
  if (list.length < 3) return null;
  return `Average pitch on your last ${list.length} practice days: ${list.map(([, d]) => signed(r0(d.sum / d.n))).join(' → ')}.`;
}
