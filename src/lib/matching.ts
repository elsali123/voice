import { brainInfo, chat } from "./ai";
import { listMatches, listStoriesByUser, listUsersByRole, suggestMatch } from "./db";
import { keywords, sharedWords } from "./keywords";
import { listenerDescription } from "./roles";
import type { User } from "./types";
import { firstName } from "./voices";

/**
 * The matching agent: suggests storytellers for each young listener based on shared interests.
 * Suggestions are only proposals; a coordinator approves or declines every pairing.
 */

const SUGGESTIONS_PER_LISTENER = 3;
const MAX_CANDIDATES_FOR_AI = 20;

interface Candidate {
  storyteller: User;
  /** Everything we know about them, as one text: profile plus story titles, summaries and tags. */
  profile: string;
  /** Short description for the AI prompt. */
  brief: string;
  shared: string[];
  score: number;
}

function listenerText(l: User) {
  return [l.interests, l.goals, l.about].join(" ");
}

function storytellerText(s: User) {
  const stories = listStoriesByUser(s.id, null).filter((st) => st.status === "ready");
  const profile = [s.hometown, s.work, s.interests, s.about, ...stories.map((st) => `${st.title} ${st.summary} ${st.tags.join(" ")}`)].join(" ");
  const brief = [
    s.birthYear && `born ${s.birthYear}`,
    s.hometown && `grew up in ${s.hometown}`,
    s.work && `work: ${s.work}`,
    s.interests && `enjoys: ${s.interests}`,
    s.about,
    stories.length && `stories: ${stories.slice(0, 4).map((st) => `"${st.title}" (${st.tags.slice(0, 5).join(", ")})`).join("; ")}`,
  ]
    .filter(Boolean)
    .join(". ");
  return { profile, brief };
}

/** Did the listener ask for this storyteller by name (e.g. a grandchild asking for their grandmother)? */
function askedFor(listener: User, storyteller: User): boolean {
  const note = ` ${listener.about.toLowerCase()} `;
  const full = storyteller.name.toLowerCase();
  const first = firstName(storyteller.name).toLowerCase();
  return note.includes(full) || (first.length > 2 && new RegExp(`\\b${first.replace(/[^a-z]/g, "")}\\b`).test(note));
}

function candidatesFor(listener: User): Candidate[] {
  const alreadyConsidered = new Set(listMatches({ listenerId: listener.id }).map((m) => m.storytellerId));
  const wants = listenerText(listener);
  return listUsersByRole("storyteller")
    .filter((s) => !alreadyConsidered.has(s.id))
    .map((s) => {
      const { profile, brief } = storytellerText(s);
      const shared = sharedWords(wants, profile);
      return { storyteller: s, profile, brief, shared, score: shared.length + (askedFor(listener, s) ? 10 : 0) };
    })
    .sort((a, b) => b.score - a.score);
}

interface Pick {
  storyteller: User;
  reason: string;
  shared: string[];
  source: "ai" | "keywords";
}

async function aiPicks(listener: User, candidates: Candidate[]): Promise<Pick[] | null> {
  if (brainInfo().provider === "scripted") return null;
  const shortlist = candidates.slice(0, MAX_CANDIDATES_FOR_AI);
  const lf = firstName(listener.name);
  const listing = shortlist.map((c, i) => `${i + 1}. ${c.storyteller.name}: ${c.brief || "no details yet"}`).join("\n");
  const prompt = `Young listener:
- Name: ${listener.name} (${listenerDescription(listener) || "no details"})
- Interests: ${listener.interests || "not given"}
- Would love to learn: ${listener.goals || "not given"}
- Note: ${listener.about || "none"}

Older storytellers:
${listing}

Choose up to ${SUGGESTIONS_PER_LISTENER} storytellers who are the best match for ${lf}: real shared interests, things ${lf} wants to learn that the storyteller lived through, or a storyteller ${lf} asked for by name. Leave out anyone with nothing real in common. Be careful to use each storyteller's own details, never another storyteller's.

Return only JSON like this:
{"matches": [{"name": "the storyteller's full name", "evidence": "the words from THAT storyteller's line that make them a match", "shared": ["baseball"], "reason": "One warm sentence, using both first names, saying what they have in common."}]}`;

  try {
    const raw = await chat(
      "You suggest pairings for an intergenerational program where young people listen to older adults' life stories. Use only the facts given. Never invent details. Reply with JSON only.",
      [{ role: "user", content: prompt }],
      { maxTokens: 700, json: true },
    );
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const parsed = JSON.parse(json) as { matches?: { name?: unknown; evidence?: unknown; shared?: unknown; reason?: unknown }[] };
    const picks: Pick[] = [];
    for (const m of parsed.matches ?? []) {
      const name = typeof m.name === "string" ? m.name.toLowerCase().trim() : "";
      const candidate = shortlist.find((c) => c.storyteller.name.toLowerCase() === name) ?? shortlist.find((c) => name && c.storyteller.name.toLowerCase().includes(name));
      if (!candidate || picks.some((p) => p.storyteller.id === candidate.storyteller.id)) continue;
      // Small models sometimes mix storytellers up. Keep a pick only if its evidence is really in that storyteller's profile.
      const evidence = typeof m.evidence === "string" ? m.evidence : "";
      if (!askedFor(listener, candidate.storyteller) && sharedWords(evidence, candidate.profile).length === 0) {
        console.warn(`[matching] dropped an AI suggestion it couldn't back up: ${listener.name} ↔ ${candidate.storyteller.name} ("${evidence}")`);
        continue;
      }
      const shared = Array.isArray(m.shared)
        ? m.shared.map((x) => String(x).toLowerCase().trim()).filter((x) => x && sharedWords(x, candidate.profile + " " + listenerText(listener)).length > 0).slice(0, 5)
        : [];
      const reason = typeof m.reason === "string" ? m.reason.trim().slice(0, 300) : "";
      picks.push({ storyteller: candidate.storyteller, shared: shared.length ? shared : candidate.shared.slice(0, 5), reason: reason || keywordReason(listener, candidate), source: "ai" });
      if (picks.length >= SUGGESTIONS_PER_LISTENER) break;
    }
    return picks.length ? picks : null;
  } catch (err) {
    console.error("[matching] AI unavailable, matching by shared interests instead:", (err as Error).message);
    return null;
  }
}

function keywordReason(listener: User, c: Candidate): string {
  const lf = firstName(listener.name);
  const sf = firstName(c.storyteller.name);
  if (askedFor(listener, c.storyteller)) return `${lf} asked to be paired with ${sf}.`;
  return `${lf} and ${sf} both mention ${c.shared.slice(0, 3).join(", ")}.`;
}

/** Suggests new storytellers for one listener. Returns how many new suggestions were made. */
export async function suggestMatchesFor(listener: User): Promise<number> {
  if (listener.role !== "listener") return 0;
  const candidates = candidatesFor(listener);
  if (!candidates.length) return 0;

  const keywordPick = (c: Candidate): Pick => ({ storyteller: c.storyteller, reason: keywordReason(listener, c), shared: c.shared.slice(0, 5), source: "keywords" });
  const picks = (await aiPicks(listener, candidates)) ?? candidates.filter((c) => c.score > 0).slice(0, SUGGESTIONS_PER_LISTENER).map(keywordPick);
  // Someone the listener asked for by name (e.g. their grandmother) is always suggested, and the
  // coordinator is told it was a request.
  for (const c of candidates) {
    if (!askedFor(listener, c.storyteller)) continue;
    const pick = picks.find((p) => p.storyteller.id === c.storyteller.id);
    if (!pick) picks.unshift(keywordPick(c));
    else if (!/asked/i.test(pick.reason)) pick.reason = `${firstName(listener.name)} asked to be paired with ${firstName(c.storyteller.name)}. ${pick.reason}`;
  }

  let added = 0;
  for (const p of picks) {
    if (suggestMatch({ listenerId: listener.id, storytellerId: p.storyteller.id, reason: p.reason, shared: p.shared, source: p.source })) added++;
  }
  console.log(`[matching] ${added} new suggestion(s) for ${listener.name}`);
  return added;
}

// ---------- "Find new matches" for everyone (runs in the background) ----------

export interface MatchJob {
  running: boolean;
  startedAt: string;
  finishedAt: string | null;
  listenersChecked: number;
  listenersTotal: number;
  suggested: number;
}

const g = globalThis as unknown as { __matchJob?: MatchJob };

export function matchJobStatus(): MatchJob | null {
  return g.__matchJob ?? null;
}

export function startMatchJob(): MatchJob {
  if (g.__matchJob?.running) return g.__matchJob;
  const listeners = listUsersByRole("listener");
  const job: MatchJob = { running: true, startedAt: new Date().toISOString(), finishedAt: null, listenersChecked: 0, listenersTotal: listeners.length, suggested: 0 };
  g.__matchJob = job;
  void (async () => {
    try {
      for (const listener of listeners) {
        try {
          job.suggested += await suggestMatchesFor(listener);
        } catch (err) {
          console.error(`[matching] failed for ${listener.name}:`, err);
        }
        job.listenersChecked++;
      }
    } finally {
      job.running = false;
      job.finishedAt = new Date().toISOString();
    }
  })();
  return job;
}

/** Ranks stories by how well they fit a listener's interests (for "Stories you might like"). */
export function interestScore(listener: User, text: string): number {
  const wants = keywords(listenerText(listener));
  let score = 0;
  for (const key of keywords(text).keys()) if (wants.has(key)) score++;
  return score;
}
