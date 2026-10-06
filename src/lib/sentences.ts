// Sentence splitting shared by the server (streaming replies) and the browser (voice playback).

const ABBREVIATIONS = /\b(mr|mrs|ms|dr|st|jr|sr|mt|vs|etc)\.$/i;

/**
 * Index just past the first complete sentence in `text` (a terminator followed by a space),
 * or -1 if no sentence is complete yet. Text still being generated has no trailing space,
 * so a half-finished sentence is never cut off.
 */
export function sentenceEnd(text: string): number {
  const re = /[.!?]+["'”’)]*\s+/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = text.slice(0, m.index + 1);
    if (!ABBREVIATIONS.test(before)) return m.index + m[0].length;
  }
  return -1;
}

export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let rest = text.replace(/\s+/g, " ").trim();
  for (let end = sentenceEnd(rest); end > 0; end = sentenceEnd(rest)) {
    out.push(rest.slice(0, end).trim());
    rest = rest.slice(end);
  }
  if (rest.trim()) out.push(rest.trim());
  return out;
}
