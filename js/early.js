// Early music: modes (lesson + "which mode?" quiz), a tuning lab for pure intervals against a drone,
// and reading old clefs. Extra env used: env.droneOn(midi, fifth) / env.droneOff() · env.toneHz(hz, s)

import { Exercise } from './practice.js';
import { Lesson } from './theory.js';
import { spell, noteText, scaleOf } from './notation.js';
import { generateMelody, chooseTonic, degreeMidi } from './melody.js';

const mode = (id, name, fifths, l, a, scale, trait) => ({ id, name, fifths, mode: id, tonic: { l, a }, scale, trait });
const DOR = [0, 2, 3, 5, 7, 9, 10], PHR = [0, 1, 3, 5, 7, 8, 10], LYD = [0, 2, 4, 6, 7, 9, 11], MIX = [0, 2, 4, 5, 7, 9, 10], AEO = [0, 2, 3, 5, 7, 8, 10], ION = [0, 2, 4, 5, 7, 9, 11];
const WHITE = [
  mode('dorian', 'D Dorian', 0, 1, 0, DOR, 'like minor, but with a raised 6th (B natural)'),
  mode('phrygian', 'E Phrygian', 0, 2, 0, PHR, 'a half step right above the final (E–F)'),
  mode('lydian', 'F Lydian', 0, 3, 0, LYD, 'like major, but with a raised 4th (B natural)'),
  mode('mixolydian', 'G Mixolydian', 0, 4, 0, MIX, 'like major, but with a lowered 7th (F natural)'),
  mode('aeolian', 'A Aeolian', 0, 5, 0, AEO, 'the natural minor scale'),
  mode('ionian', 'C Ionian', 0, 0, 0, ION, 'the major scale'),
];
const FLAT = [ // the same modes transposed with one flat
  mode('dorian', 'G Dorian', -1, 4, 0, DOR, ''), mode('phrygian', 'A Phrygian', -1, 5, 0, PHR, ''), mode('lydian', 'B♭ Lydian', -1, 6, -1, LYD, ''),
  mode('mixolydian', 'C Mixolydian', -1, 0, 0, MIX, ''), mode('aeolian', 'D Aeolian', -1, 1, 0, AEO, ''), mode('ionian', 'F Ionian', -1, 3, 0, ION, ''),
];
const NAME = { dorian: 'Dorian', phrygian: 'Phrygian', lydian: 'Lydian', mixolydian: 'Mixolydian', aeolian: 'Aeolian', ionian: 'Ionian' };
const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const shuffle = (rng, a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const seq = (notes, d = 0.42) => notes.map((m, i, a) => ({ notes: [m], dur: i === a.length - 1 ? d * 2 : d }));

function modeCards(env) {
  const r = env.range();
  const scaleCard = (k, text) => {
    const place = chooseTonic(k, r.low, r.high);
    const t = place ? place.t : 60;
    const notes = [0, 1, 2, 3, 4, 5, 6, 7].map((d) => degreeMidi(t, scaleOf(k), d));
    return { text, key: k, items: notes.map((m, i) => ({ midi: m, state: i === 0 || i === 7 ? 'good' : 'pending' })), play: seq(notes) };
  };
  return [
    { text: '<b>Modes</b> are the scales of chant and Renaissance music. Each uses the white notes, but starts and ends on a different note — its <b>final</b>. Moving the final changes where the half steps fall, and so the mood.', key: null, items: [] },
    scaleCard(WHITE[0], '<b>Dorian</b> (final D): sounds minor, but its 6th is raised — the most common mode in chant.'),
    scaleCard(WHITE[1], '<b>Phrygian</b> (final E): a half step right above the final gives it a dark, Spanish-tinged colour.'),
    scaleCard(WHITE[2], '<b>Lydian</b> (final F): major with a raised 4th — bright, a little unsettled.'),
    scaleCard(WHITE[3], '<b>Mixolydian</b> (final G): major with a lowered 7th.'),
    scaleCard(WHITE[4], '<b>Aeolian</b> (final A) is the natural minor scale, and <b>Ionian</b> (final C) is the major scale.'),
    { text: '<b>Naming the mode.</b> Look at the final (the last note) and the signature. No flats: D = Dorian, E = Phrygian, F = Lydian, G = Mixolydian, A = Aeolian, C = Ionian. One flat moves everything down a 5th: G Dorian, A Phrygian, B♭ Lydian, C Mixolydian, D Aeolian, F Ionian. (Chant also uses each mode’s range and reciting note, but the final comes first.)', key: null, items: [] },
  ];
}

class WhichMode extends Exercise {
  get needsMic() { return false; }
  start() { this.next(); }
  next() {
    const pool = this.level === 'easy' ? WHITE.slice(0, 4) : this.level === 'medium' ? WHITE : [...WHITE, ...FLAT];
    const k = pick(this.env.rng, pool);
    const r = this.env.range();
    const m = generateMelody({ key: k, level: 3, length: 8, low: r.low, high: r.high, rng: this.env.rng });
    if (!m) return this.ui.question('Your practice range is too narrow — widen it in Settings → Practice.');
    this.k = k; this.notes = m.notes.map((n) => n.midi); this.answered = false;
    const names = this.level === 'easy' ? WHITE.slice(0, 4).map((x) => x.mode) : Object.keys(NAME);
    const opts = shuffle(this.env.rng, [k.mode, ...shuffle(this.env.rng, names.filter((x) => x !== k.mode)).slice(0, 3)]);
    this.env.staff.setExercise({ key: k, items: this.notes.map((x) => ({ midi: x, state: 'pending' })) });
    this.ui.question('Which mode is this melody in?');
    this.ui.prompt('<span class="muted">Look at the last note and the signature.</span>');
    this.ui.answers(opts.map((x) => ({ value: x, label: NAME[x] })), 4);
    this.ui.buttons([{ id: 'hear', label: '▶ Hear it' }, { id: 'next', label: 'Skip' }]);
  }
  answer(v) {
    if (this.answered) return;
    this.answered = true;
    const ok = v === this.k.mode;
    this.total++; if (ok) this.right++;
    this.score();
    const fin = noteText(spell(this.notes[this.notes.length - 1], this.k));
    this.env.staff.setExercise({ key: this.k, items: this.notes.map((x, i, a) => ({ midi: x, state: i === a.length - 1 ? (ok ? 'good' : 'off') : 'pending' })) });
    const sig = this.k.fifths ? 'one flat' : 'no sharps or flats';
    this.ui.prompt(`${ok ? '✓' : '✗'} It ends on ${fin} with ${sig}: <b>${this.k.name}</b>.${this.k.trait ? ' ' + NAME[this.k.mode] + ' is ' + this.k.trait + '.' : ''}`);
    this.ui.answers(null);
    this.ui.buttons([{ id: 'hear', label: '▶ Hear it' }, { id: 'next', label: 'Next', primary: true }]);
  }
  button(id) { if (id === 'hear') this.env.play(seq(this.notes, 0.45)); if (id === 'next') this.next(); }
}

// Pure intervals: sing against a drone and find the beatless spot. Pure 5th = 702¢, major 3rd = 386¢
// (14¢ below the piano's), minor 3rd = 316¢ (16¢ above).
const LAB = {
  easy: { semis: 7, name: 'perfect 5th', pure: 701.96 },
  medium: { semis: 4, name: 'major 3rd', pure: 386.31 },
  hard: { semis: 3, name: 'minor 3rd', pure: 315.64 },
};
class TuningLab extends Exercise {
  start() { this.cfg = LAB[this.level]; this.next(); }
  next() {
    const r = this.env.range();
    this.root = r.low + Math.floor(this.env.rng() * Math.max(1, r.high - r.low - this.cfg.semis - 2));
    this.target = this.root + this.cfg.semis;
    this.pureOff = this.cfg.pure - this.cfg.semis * 100; // cents relative to the piano's version
    this.on = 0; this.done = false;
    this.env.droneOn(this.root, this.cfg.semis !== 7); // for the 3rds, the drone plays root + 5th: you complete the chord
    this.meter = { pure: this.pureOff, cents: null, label: `${this.cfg.name} above ${noteText(spell(this.root, null))}` };
    this.env.staff.setExercise({ meter: this.meter, animate: true });
    this.ui.question(`Sing a <b>${this.cfg.name}</b> above the drone (${this.env.name(this.target, null)}), and slide until the beating stops.`);
    this.ui.prompt(`<span class="muted">The pure ${this.cfg.name} is ${Math.abs(Math.round(this.pureOff))}¢ ${this.pureOff < 0 ? 'below' : 'above'} the piano’s.</span>`);
    this.ui.buttons([{ id: 'pure', label: '▶ Hear it pure' }, { id: 'next', label: 'New note' }]);
  }
  live(note, cents, dt, line, centre) {
    if (centre == null) { this.meter.cents = null; return; }
    const dev = (centre - this.target) * 100;
    this.meter.cents = Math.abs(dev) < 60 ? dev : null;
    if (this.done || this.meter.cents == null) return;
    if (Math.abs(dev - this.pureOff) <= 5) { this.on += dt; if (this.on >= 1.5) { this.done = true; this.total++; this.right++; this.score(); this.ui.prompt(`✓ Pure ${this.cfg.name}: notice how the wobble against the drone disappeared.`); } }
    else this.on = Math.max(0, this.on - dt);
  }
  button(id) {
    if (id === 'pure') this.env.toneHz(this.env.freqOf(this.root) * Math.pow(2, this.cfg.pure / 1200), 2.5);
    if (id === 'next') this.next();
  }
  stop() { super.stop(); this.env.droneOff(); }
}

function clefCards(env) {
  const line = [50, 53, 55, 57, 55, 53, 52, 50]; // D3 F3 G3 A3 G3 F3 E3 D3 — a typical tenor phrase
  const items = line.map((m) => ({ midi: m, state: 'pending' }));
  return [
    { text: '<b>The C clef</b> marks middle C: the two curves point to it. In the <b>tenor clef</b> it sits on the 4th line, so the lines (bottom to top) are D F A C E.', view: 'tenorC', key: null, items: [{ midi: 60, state: 'good', label: 'middle C' }] },
    { text: 'A tenor phrase in the <b>tenor C clef</b>, as in many older editions…', view: 'tenorC', key: null, items, play: seq(line) },
    { text: '…and the same notes in the modern <b>treble clef with an 8</b>. Same sound, written a line or space apart.', view: 'tenor', key: null, items, play: seq(line) },
    { text: 'The <b>alto clef</b> puts middle C on the middle line (lines F A C E G). Old editions use it for alto parts; violas still read it.', view: 'alto', key: null, items: [{ midi: 60, state: 'good', label: 'middle C' }, ...[53, 57, 62, 65].map((m) => ({ midi: m, state: 'pending' }))] },
    { text: 'Tip: older editions sometimes write the tenor part in a plain treble clef without the 8. It still sounds an octave lower than written.', view: 'tenor', key: null, items: [{ midi: 57, state: 'pending' }] },
  ];
}

export const EARLY = [
  { id: 'em-modes', title: 'Modes', blurb: 'Dorian, Phrygian, Lydian, Mixolydian and friends: what they are and how to name them.', make: (e) => new Lesson(e, { cards: modeCards, quiz: 'em-whichmode' }) },
  { id: 'em-whichmode', title: 'Which mode?', blurb: 'A melody on the staff: name its mode from the final and signature.', levels: true,
    why: 'Easy: Dorian, Phrygian, Mixolydian, Aeolian. Medium: all six white-note modes. Hard: also the one-flat transpositions.', make: (e, o) => new WhichMode(e, o) },
  { id: 'em-lab', title: 'Tuning lab', blurb: 'Sing pure intervals against a drone until the beating stops.', levels: true,
    why: 'Easy: the perfect 5th. Medium: the major 3rd (pure is 14¢ below the piano). Hard: the minor 3rd (16¢ above). The meter shows both the piano’s pitch and the pure one.', make: (e, o) => new TuningLab(e, o) },
  { id: 'em-clefs', title: 'Old clefs', blurb: 'Reading the tenor and alto C clefs.', make: (e) => new Lesson(e, { cards: clefCards }) },
];
