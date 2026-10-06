// Simple interest-word matching, used to rank candidates for the matching agent, as its fallback
// when no AI is available, and for "Stories you might like".

const STOP_WORDS = new Set(
  `a about after again all also am an and any are around as at be because been before being both but by can could did do does doing done down during each
  every few for from get got had has have having he her here hers him his how i if in into is it its just like love loved lot lots me more most much my
  no not now of off on once only or other our out over own really same she so some such than that the their them then there these they this those
  through to too under until up us very was we were what when where which while who whom why will with would you your yours
  enjoy enjoying enjoyed things thing stuff learn learning know want wanted older old people person life lives story stories time times year years good great
  kind kinds especially different hear hearing talk talking someone something everything grow grew growing used`
    .split(/\s+/)
    .filter(Boolean),
);

/** Rough word stem, so "nurse", "nurses" and "nursing" (or "bake" and "baking") count as the same word. */
function stem(word: string): string {
  let w = word;
  for (const suffix of ["ings", "ing", "ers", "er", "ies", "es", "s"]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) {
      w = suffix === "ies" ? `${w.slice(0, -3)}y` : w.slice(0, -suffix.length);
      break;
    }
  }
  return w.length > 4 && w.endsWith("e") ? w.slice(0, -1) : w;
}

/** Meaningful words in a text, as stem → the word as it was written. */
export function keywords(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of text.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/)) {
    const word = raw.replace(/^['-]+|['-]+$/g, "");
    // Numbers are skipped, except years like "1956".
    if (word.length < 3 || STOP_WORDS.has(word) || (/^\d+$/.test(word) && word.length !== 4)) continue;
    const key = stem(word);
    if (!out.has(key)) out.set(key, word);
  }
  return out;
}

/** Words two texts have in common (as written in the first text). */
export function sharedWords(a: string, b: string): string[] {
  const kb = keywords(b);
  return [...keywords(a)].filter(([key]) => kb.has(key)).map(([, word]) => word);
}
