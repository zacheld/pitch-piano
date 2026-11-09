# Pitch Piano

A personal singing app for iPhone: sing and see your pitch as a line over time, with a full 88-key piano underneath. No ads, no account, nothing sent anywhere. It's a web app added to the Home Screen, so it needs no App Store and no Apple Developer account.

## Using it

- **Start listening** (red mic button). The first time, iPhone asks to use the microphone: tap Allow.
- **The big readout** shows the note (C4), its octave label (mid2 C, or c′ in Helmholtz style), the frequency and how many cents sharp or flat you are. Vibrato is averaged out of the readout, so a well-centred note with vibrato reads as in tune; the line itself still shows the vibrato.
- **The graph**: one lane per semitone; your voice is the line, coloured green (within 10 cents), yellow (within 25) or orange. Piano notes you play appear as purple bars so you can sing against them.
- **Pause** freezes the graph so you can look at what you just sang.
- **Range** (top left) records the lowest and highest notes you've held for half a second. Tap it twice to reset. Piano notes don't count.
- **Piano**: tap or slide across the keys. Move along the keyboard with the strip above it (tap or drag) or the ‹ › buttons; the keys themselves never scroll, so playing never moves them by accident. **Sustain** lets notes ring after you lift your finger.
- **Louder piano while listening** (Settings → iPhone audio, on by default): while the mic is on, iPhone puts Safari into a call-style audio mode that turns ordinary web audio way down. With this on, the piano is played the way call audio is, so it stays loud. Turn on **Echo cancellation** as well to keep the piano out of the microphone.
- **Settings** (sliders button): tuning (A4 = 415 Baroque, 430, 440, 442, 466, or any value; the piano retunes too), mic sensitivity, response speed, octave label style, sharps or flats, graph size, key labels and size, and whether the sung note lights up on the keyboard.

### Staff view and key

- **Graph | Staff** (under the readout) switches the top of the screen between the pitch graph and a staff. On the staff, every note you hold (and every key you play, in purple) is written down in order, with the note you're singing now at the right and an optional short pitch line beside it.
- **Clefs** (Settings → Key and staff): tenor (treble with 8 below, the default), treble, bass, grand staff (treble + bass, like piano music), treble + bass with every note shown on both (to learn how the clefs relate), and the tenor C clef for early-music editions.
- **Key** (the chip next to it): sets the key signature, how notes are spelled (F♯ or G♭), and the key used by practice and the drone.

### Practice (the Practice button)

Four tabs, so nothing is one long list:

- **Singing** — Sight-singing (graded melodies, 5 levels), Intervals, Echo (hear a tune, sing it back), Pitch matching (right away or from memory), Scale & return (up and down the scale: do you land back on do?).
- **Ear** — Scale degrees (functional ear training: a cadence, a note, which degree?), Note naming (perfect-pitch training that adds notes as you improve).
- **Theory** — Keys & key signatures, Finding the key, Chords: each a short lesson with examples you can play, then quizzes (name the key from a signature, major or relative minor, chords of the key in Roman numerals, chord qualities by ear).
- **Tools** — Held note (vibrato speed and width, tuning, drift), Drone (a steady home note to tune against), Record & replay.

Settings → Practice sets your voice type and range (melodies stay inside it) and how close counts as right (judged on the settled, vibrato-averaged pitch).

### Record and replay

The ● button records your voice (raw, up to 2 minutes) with the pitch line; **Replay** plays it back with the graph or staff redrawn in step.

### Octave labels

| Scientific | Karaoke style (default) | Helmholtz |
|---|---|---|
| C2 | low C | C |
| C3 | mid1 C | c |
| C4 (middle C) | mid2 C | c′ |
| A4 (440 Hz) | hi A | a′ |
| C5 | hi C | c″ |
| C6 | hihi C | c‴ |

Karaoke blocks run from A up to G♯ (mid2 = A3–G♯4), matching the Japanese system used by Pitch Checker and karaoke scoring.

## Installing on iPhone

1. Open the app's web address in **Safari**.
2. Tap **Share** → **Add to Home Screen** → keep **Open as Web App** on → **Add**.
3. Open it from the new icon. It runs full-screen, appears in the app switcher on its own, and works offline once it has loaded.

iPhone asks for microphone permission each time the app is opened; Home Screen web apps can't keep that permission (a Safari limitation, not something the app can change). Updates install by themselves: open the app, and it switches to the new version within a few seconds unless you're listening.

## Files

- `index.html`, `css/`, `js/`: the app. `js/pitch.js` is the pitch detector (McLeod Pitch Method) and tracker; `js/notes.js` the note naming.
- `samples/`: 42 piano notes (Steinway B, Versilian Community Sample Library, CC0), ~2.9 MB of AAC.
- `js/staff.js`, `js/notation.js`, `js/glyphs.js`: staff drawing, music-notation rules, and music symbols from the Bravura font (SIL Open Font License, `licenses/Bravura-OFL.txt`).
- `js/practice.js`, `js/theory.js`, `js/melody.js`, `js/analysis.js`: exercises, lessons and quizzes, melody generator, held-note analysis.
- `sw.js`: offline cache. **Change `VERSION` in `sw.js` whenever you publish an update**, or phones keep the old copy.
- `manifest.webmanifest`, `icons/`: Home Screen name and icon.

## Development

```sh
npm install                 # test tooling only (Playwright); the app itself has no dependencies
npm test                    # pitch detection and note-name tests
node tools/check.mjs        # browser checks: WebKit at iPhone size, Chrome with a fake singing microphone
npm run serve               # http://localhost:8123
```

Rebuilding the piano samples: `node tools/fetch-samples.mjs <dir>` then `node tools/make-samples.mjs <dir> <work-dir>` (macOS, uses `afconvert`). Icons: `node tools/make-icons.mjs`.

Music symbols: `node tools/make-glyphs.mjs <Bravura.otf> <Bravura.json>` (from github.com/steinbergmedia/bravura).

## Credits

Piano: *Grand Piano, Steinway B* from the [Versilian Community Sample Library](https://github.com/sgossner/VCSL) (CC0 1.0), Versilian Studios LLC / Sam Gossner. Credit is a courtesy; CC0 requires none.

Music symbols: [Bravura](https://github.com/steinbergmedia/bravura) © Steinberg Media Technologies GmbH, SIL Open Font License 1.1 (`licenses/Bravura-OFL.txt`).
