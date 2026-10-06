import { nextLine, priorStoriesFor } from "@/lib/interviewer";
import { currentUser, unauthorized } from "@/lib/session";
import { TOPICS } from "@/lib/topics";
import type { HistoryItem, InterviewAction } from "@/lib/types";
import { badRequest, readJson } from "@/lib/validate";

const ACTIONS: InterviewAction[] = ["start", "answer", "skip", "unheard", "wrap"];

/**
 * Given the conversation so far, streams what the interviewer says next: one JSON line per
 * sentence ({"text": "..."}), sent as soon as each sentence is ready.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  if (user.role !== "storyteller") return Response.json({ error: "Only storytellers record stories." }, { status: 403 });
  const body = await readJson(req);

  const topicId = TOPICS.some((t) => t.id === body.topic) ? (body.topic as string) : null;
  const action = ACTIONS.includes(body.action as InterviewAction) ? (body.action as InterviewAction) : null;
  if (!topicId || !action || !Array.isArray(body.history)) return badRequest("Invalid interview request");

  const history: HistoryItem[] = body.history
    .filter(
      (h): h is HistoryItem =>
        !!h && (h.role === "interviewer" || h.role === "storyteller") && typeof h.text === "string",
    )
    .slice(-200)
    .map((h) => ({ role: h.role, text: h.text.slice(0, 5000) }));

  const sentences = nextLine({
    user,
    topicId,
    history,
    action,
    elapsedSec: typeof body.elapsedSec === "number" ? body.elapsedSec : 0,
    checkIn: body.checkIn === true,
    priorStories: priorStoriesFor(user.id),
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await sentences.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(`${JSON.stringify({ text: value })}\n`));
      } catch (err) {
        controller.error(err);
      }
    },
    // The browser went away (e.g. "Finish" was pressed): stop generating.
    async cancel() {
      await sentences.return(undefined);
    },
  });
  // no-transform: keeps the dev server from compressing (and so buffering) the stream.
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-cache, no-transform" } });
}
