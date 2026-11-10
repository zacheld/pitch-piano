# Attribution and licences

Everything under `assets-src/samples/` and `assets-src/drums/` is a **processed derivative** of the freely licensed recordings listed below (mono mix, resampled to 44.1 kHz, onset-trimmed, faded, level-normalised, looped where sustained, re-encoded as 16-bit FLAC; some instruments are layered mixes or resampled/pitch-shifted copies - see `samples/manifest.json`, `files[].sources`). Generated 2026-10-23.

**Only one source requires attribution** (Greg Sullivan's Wurlitzer EP200, CC BY 3.0): its credit block is in section 3 and must be kept with any redistribution. All other sources are CC0 1.0 (public-domain dedication); their credits below are given as a courtesy, and the VSCO 2 CE authors additionally *ask* for credit (section 2).

| # | Source | Licence | Used for |
|---|--------|---------|----------|
| 1 | Versilian Community Sample Library (VCSL) | CC0 1.0 | `piano`, `grandpiano`, `harp`, `vibraphone`, `horns` |
| 2 | VS Chamber Orchestra: Community Edition (VSCO 2 CE) | CC0 1.0 (credit requested) | `strings`, `violins`, `viola`, `cellos`, `brass`, `horns`, `clarinet`, `flute` |
| 3 | Greg Sullivan - Wurlitzer EP200 (via sfzinstruments/GregSullivan.E-Pianos) | **CC BY 3.0** (attribution) | `retroep` |
| 4 | FreePats - FM Synthesized Piano #1 | CC0 1.0 | `tineep` |
| 5 | FreePats - Electric Guitar FSBS (clean) | CC0 1.0 | `eguitar` |
| 6 | Karoryfer Samples - Shinyguitar | CC0 1.0 | `acoustic` |
| 7 | FreePats - Drawbar Organ Emulation (setBfree render) | CC0 1.0 | `organ` (synthesised, optional) |
| 8 | Freesound CC0: ShangusBurger / Shane Vincent crowd singing; maurolupo | CC0 1.0 | `voxahh`, `humming` |
| 9 | Virtuosity Drums (Karoryfer / Versilian) | CC0 1.0 | drum kit `tightkit` |
| 10 | FreePats - Synthesizer percussion | CC0 1.0 | drum kit `synthkit` |

---

## 1. Versilian Community Sample Library (VCSL) - CC0 1.0

- URL: https://github.com/sgossner/VCSL
- Licence: Creative Commons CC0 1.0 Universal - https://creativecommons.org/publicdomain/zero/1.0/
- Verified from the repository's own `LICENSE` (CC0 1.0 legal code) and `README.md` ("an open CC0 general-purpose sample library ... you can do whatever you want with these sounds (even make commercial software), no royalties, no credit, no special terms").
- Credit (courtesy): Versilian Studios LLC / Sam Gossner. Instruments used: *Upright Piano, Yamaha* (VCSL's note: "a cleaned, recut, and remastered version of the samples found in 'Upright No. 1' ... in VSCO 2 CE") -> `piano`; *Grand Piano, Steinway B* (`JHPiano`, NoSus / Close mic) -> `grandpiano`; *Concert Harp* (`KSHarp`) -> `harp`; *Vibraphone* (soft mallets) -> `vibraphone`; *Tenor Saxophone* (non-vibrato) -> layered into `horns`.
- Caveat: the README invites third-party contributions; the repository-level CC0 `LICENSE` is the evidence relied on for every VCSL file used.

## 2. VS Chamber Orchestra: Community Edition (VSCO 2 CE) - CC0 1.0

- URL: https://github.com/sgossner/VSCO-2-CE (project page: http://vis.versilstudios.net/vsco-community.html)
- Licence: Creative Commons CC0 1.0 Universal - https://creativecommons.org/publicdomain/zero/1.0/
- Verified from the repository's own `LICENSE` (CC0 1.0 legal code). `Readme.txt` states: "You are permitted to use these samples for ANY purpose. We ask that you do not sell the samples directly, and encourage you to keep any work done on improving the sample set open and public. Please provide credit to Versilian Studios/Sam Gossner, and/or Ivy Audio/Simon Dalzell where applicable, and link to the VSCO: CE homepage." These requests are not conditions of CC0; they are honoured here by this credit and by keeping the derived set open.
- Credit: **VS Chamber Orchestra: Community Edition (VSCO 2 CE), Versilian Studios LLC / Sam Gossner, Ivy Audio / Simon Dalzell** (recorded by Sam Gossner & Simon Dalzell; sample cutting by Elan Hickler/Soundemote). Instruments used: Violin / Viola / Cello *Section* (sustain with vibrato) -> `violins`, `viola`, `cellos`, layered into `strings`; French horn, tenor trombone, trumpet (sustain) -> `brass`, `horns`; clarinet (long sustain) -> `clarinet`; flute (non-vibrato sustain) -> `flute`.

## 3. Greg Sullivan - Wurlitzer EP200 Electric Piano - CC BY 3.0 (ATTRIBUTION REQUIRED)

- URL: https://github.com/sfzinstruments/GregSullivan.E-Pianos (author site: http://www.sullivang.net/)
- Licence: Creative Commons Attribution 3.0 Unported - http://creativecommons.org/licenses/by/3.0/
- Verified from the repository's own `README.md` ("This work is licensed under a Creative Commons Attribution 3.0 Unported License"; "3 piano instruments made by Greg Sullivan, with the author permission with the request for attribution") and `LICENSE` (CC BY 3.0 legal code). SFZ mapping by kinwie.
- **Required credit:** *Wurlitzer EP200 Electric Piano v1.1 (16 May 1999), (c) Greg Sullivan, licensed under CC BY 3.0 (http://creativecommons.org/licenses/by/3.0/); obtained via https://github.com/sfzinstruments/GregSullivan.E-Pianos (mapping by kinwie). Modified: mono mix, trimmed, faded, level-normalised, re-encoded as FLAC.*
- Used for: `retroep` ('f' velocity layer samples).

## 4. FreePats - FM Synthesized Piano #1 - CC0 1.0

- URL: https://github.com/freepats/fm-piano1  (https://freepats.zenvoid.org/)
- Licence: CC0 1.0 - verified from the repository `README.txt` ("Published under the terms of Creative Commons CC0 public domain dedication") and `LICENSE.txt` (CC0 1.0 text).
- Credit (courtesy): Roberto <roberto@zenvoid.org> for the FreePats project. An imitation of the Yamaha DX7 "E. Piano 1" patch **recorded from the Hexter software synthesizer** - i.e. a synthesised render, not a recording of a real Rhodes. Used for: `tineep` (velocity 80).

## 5. FreePats - Electric Guitar FSBS (clean) - CC0 1.0

- URL: https://github.com/freepats/electric-guitar-FSBS-clean
- Licence: CC0 1.0 - verified from the repository `README.txt` and `LICENSE.txt`.
- Credit (courtesy): FreePats project (direct-sampled Fender electric guitar, bridge pickup, processed through an amplifier and effects rack for the clean tone). Used for: `eguitar`.

## 6. Karoryfer Samples - Shinyguitar - CC0 1.0

- URL: https://github.com/sfzinstruments/karoryfer.shinyguitar
- Licence: CC0 1.0 - verified from the repository `LICENSE` (CC0 1.0 text); `readme.txt`: "This instrument is open source ... royalty-free for all commercial and non-commercial use." Copyright 2015, 2018 Karoryfer Lecolds.
- Credit (courtesy): archtop guitar played and mapped by D. Smolken (Karoryfer Samples). Used for: `acoustic` (microphone signal, velocity layer 3).

## 7. FreePats - Drawbar Organ Emulation - CC0 1.0 (synthesised; optional)

- URL: https://freepats.zenvoid.org/Organ/electric-organ.html#DrawbarOrganEmulation
- Licence: CC0 1.0 - verified from the FreePats page and the `readme.txt` inside `DrawbarOrganEmulation-SFZ-20190712.tar.xz` ("Published under the terms of Creative Commons CC0 public domain dedication").
- Credit (courtesy): Roberto <roberto@zenvoid.org> for the FreePats project; audio rendered from the setBfree software organ emulator (http://setbfree.org/). **This is an emulator render, not a recording of a physical organ**; it is flagged `synthesized` / `optional` in the manifest. Used for: `organ`.

## 8. Freesound (CC0 only)

Original downloads on Freesound require a login, so the **HQ preview files** (lossy OGG, ~175 kbps) served from cdn.freesound.org were used, as permitted by the brief. The licence of each sound was read from its Freesound page ("Creative Commons 0", https://creativecommons.org/publicdomain/zero/1.0/).

- Freesound user **ShangusBurger** (file names credit 'ShaneVincent', GSC24), *CRWDSing_Ahh Vowel Sung Near F 02* (XY AKG214 capture) - https://freesound.org/people/ShangusBurger/sounds/763910/ -> `voxahh` (roots C3-A#3, by resampling).
- Freesound user **ShangusBurger** (file names credit 'ShaneVincent', GSC24), *CRWDSing_Mmm Hummed Near F* (XY AKG214 capture) - https://freesound.org/people/ShangusBurger/sounds/763890/ -> `humming`.
- **maurolupo**, *Aaahh* (solo girl's voice; Behringer C-3 mic, Edirol UA-4FX, Cubase 5) - https://freesound.org/people/maurolupo/sounds/211628/ -> `voxahh` (roots E4-C5).

## 9. Virtuosity Drums (Karoryfer Samples / Versilian Studios) - CC0 1.0

- URL: https://github.com/sfzinstruments/virtuosity_drums
- Licence: CC0 1.0 - verified from the repository `LICENSE` (CC0 1.0 legal code). The README describes a contemporary jazz drum kit performed by drummer Austin McMahon on the house kit of Virtuosity Musical Instruments (Boston, MA); it contains no separate licence statement beyond the `LICENSE` file.
- Credit (courtesy): Versilian Studios LLC / Karoryfer Samples; performer Austin McMahon. Used for drum kit `tightkit` (close/mid/overhead mics mixed, mid-high velocity layers).

## 10. FreePats - Synthesizer percussion - CC0 1.0

- URL: https://github.com/freepats/synthesizer-percussion
- Licence: CC0 1.0 - verified from the repository `README.md` and `LICENSE`.
- Credit (courtesy): Roberto <roberto@zenvoid.org>; created with the Yoshimi and Geonkick software synthesizers and edited with Audacity. Used for drum kit `synthkit` (an analog-style approximation of vintage electronic drum sounds; **not** a LinnDrum).

---

## Sources considered and NOT used

| Source | Why not |
|--------|---------|
| jRhodes3 (sfzinstruments/jlearman.jRhodes3c/d) - the only free *real* Rhodes found | Samples are **CC BY-NC** (non-commercial; the repos' own `LICENSE` files, the 'c' repo adds -SA) - excluded by the licensing rules. |
| FreePats FSS Steel-String Acoustic Guitar | **GPLv3 (+exception)** - share-alike licence with unclear scope for samples. |
| sfzinstruments repos for which GitHub reports no licence file (e.g. OvationGuitar, SMDrums, TicTokMen kits, Maestro Concert Grand, Splendid Grand Piano) | Licence not verified -> skipped per the rules (not examined further). |
| DrumGizmo-derived kits (DRSKit, MuldjordKit, Naked Drums) and Salamander Grand Piano | Listed as CC BY (GitHub metadata / FreePats pages) - usable with attribution, but not needed because CC0 alternatives covered the same instruments. |
| Freesound 'LinnDrum', 'Transistor Organ', 'Rhodes' uploads (incl. Rhodes loops) | Single notes/loops of uncertain provenance or a single pitch only (see `skipped` in the manifest). |
| EwonRael/BushDrum (LinnDrum LM-2 SFZ kit, `LICENSE` = CC0-1.0) | Its SFZ header says the samples come from machines.hyperreal.org/manufacturers/Linn/LinnDrum/, a plain archive page (linndrum.zip) with no licence or copyright statement; no grant from the original rights holder was found, so the CC0 label cannot be traced -> unknown-origin pack, skipped. |
| University of Iowa Musical Instrument Samples | Not needed (CC0 sources covered every instrument). Its page (theremin.music.uiowa.edu/MIS.html, read 2026-10-23) says the samples "may be downloaded and used for any projects, without restrictions"; it has no separate licence text. |

## Disclaimer

The recordings are provided as processed data for an unofficial emulator of a hobby device. The credited persons and projects do not endorse this project. CC0 material carries no attribution duty; CC BY 3.0 material (section 3) must keep the credit above.
