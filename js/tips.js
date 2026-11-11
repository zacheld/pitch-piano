// Tips shown after exercises, chosen by feedback.js from what the numbers show. Where a tip rests on a
// study it says so; where it's studio tradition it says that instead. Sources (checked 2026-11):
//  Vurma & Ross 2006/2007 (in Vurma's thesis, digar.ee/arhiiv/en/download/247137): a trained tenor heard
//    ~20¢ higher than a piano at the same pitch; singers judge their own tuning poorly while singing but
//    as well as experts from a recording.
//  Sundberg (ICPhS 1995): breath (subglottal) pressure errors show up as pitch errors.
//  Titze, J. Singing 2006: louder singing tends to raise pitch.
//  Larrouy-Maestri & Pfordresher 2018 (JEP:HPP): even highly trained singers rarely start exactly on pitch;
//    scoops change listeners' judgements; breath control at note ends.
//  Pfordresher & Halpern 2013: vivid pitch imagery goes with accurate imitation (abstract).
//  de Krom & Bloothooft 1995: notes after downward steps overshoot low.
//  Mürbe et al. 2002/2004, Dalla Bella 2007: slow legato singing is more accurate than fast/staccato.
//  Larrouy-Maestri et al. 2014: trained singers' interval errors in songs average about 30¢.
//  Sundberg on elite tenors (Interdisciplinary Studies in Musicology): several sharpened, not flattened,
//    through the passaggio.
//  Repp & Su 2013 review: taps lead a metronome by ~20–50 ms (musicians less); subdividing steadies timing
//    when subdivisions are ≥ ~200–250 ms apart.
//  Wine, ACDA ChorTeach 2023: count-singing keeps you engaged through long notes; slow down and subdivide
//    when rushing; final consonants on the rest.
//  Richard Miller via Hauck 2020: keep the vowel at the same intensity until the consonant.

export const TIPS = {
  flat: 'You ran flat of the piano. Part of that is how voices are heard: in one study a trained tenor sounded about 20¢ higher than a piano at the same pitch, so a reading of about −10¢ already sounds in tune. Aim for 0 to −10¢ on the meter rather than consciously pushing up.',
  support: 'Breath pressure moves pitch (Sundberg): if it sags, so does the note. Keep the support steady right to the end of each note, especially at phrase ends and when you get quieter.',
  sharp: 'You ran sharp. Singing louder tends to raise pitch (Titze), so try the same phrase lighter and watch whether the meter settles. A few cents sharp is no worry: listeners forgive sharp more readily than flat.',
  flatHigh: 'Your higher notes were flatter than your lower ones. That isn’t inevitable: studies of top tenors found several going sharp, not flat, through the passaggio. Keep the breath pressure steady as you climb, and check single high notes in Tools → Held note to see whether they settle or sag. (Teachers often blame a heavy or under-supported sound up there; that’s studio experience rather than tested.)',
  sharpHigh: 'Your higher notes were sharper than your lower ones. Some great tenors do the same (Björling rose about 40¢ through the passaggio), but if it’s more than about 20¢, try easing off the push on top notes.',
  flatDown: 'You sagged on the way down. Measurements show notes after a downward step tend to land low (de Krom & Bloothooft). Think of descending steps as a little smaller than they feel, and keep the pitch up as you come down.',
  scoop: 'Many notes started under the pitch and slid up. Short onset glides are normal even in professionals, but listeners do notice them (Larrouy-Maestri & Pfordresher). Hear the note clearly in your head before you sing it (vivid pitch imagery goes with accurate singing), then start the vowel right on it.',
  spread: 'Your notes varied quite a bit, without leaning one way. Slower, legato singing is measurably more accurate than fast or detached singing, so slow down; Pitch memory and Held note are good for steadiness.',
  pitchGood: 'Pitch was in good shape. For comparison, trained singers singing songs in published studies average about 30¢ error per interval; you were well inside that here.',
  listenBack: 'Use Record &amp; replay (the ● button): singers judge their own tuning poorly while singing, but as well as expert listeners when they hear a recording (Vurma &amp; Ross).',
  rush: 'You tapped ahead of the beat. A little is normal (people tap 20–50 ms ahead of a metronome, musicians less), but more than that is rushing. Count the subdivisions out loud (“1 &amp; 2 &amp;”); when something rushes, slow it down and subdivide. If every tap reads early by the same amount, run Calibrate taps in Rhythm → Metronome.',
  drag: 'You tapped behind the beat. Check the phone first: Rhythm → Metronome → Calibrate taps, since touch-screen delay can make every tap read late. If it’s still late, count the subdivisions out loud and feel each note start with the click.',
  rests: 'You came in early after a rest. Count rests exactly like notes, out loud (“1 &amp; 2 &amp; [3 &amp;] 4”), and keep the beat going through the silence.',
  subdivide: 'Missed notes or extra taps: in busy rhythms, say the smallest division under your breath (“1 e &amp; a”). Subdividing measurably steadies timing as long as the subdivisions aren’t too fast.',
  holdFull: 'Some notes were let go too soon. Keep each note going until the next one or the rest arrives (Richard Miller: keep the vowel at the same intensity until it reaches the consonant). Counting through long notes keeps you with them to the end.',
  release: 'Some notes ran into the rest. Lift exactly where the rest begins: in choral singing the final consonant goes on that beat (“1 &amp; 2 &amp; 3 &amp; t”).',
  steady: 'Your timing varied a lot from note to note. Tap along with the Metronome’s subdivisions to steady it; consistency comes before precision.',
};
