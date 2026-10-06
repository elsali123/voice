import { createStory } from "@/lib/db";
import { currentUser, unauthorized } from "@/lib/session";
import { TOPICS } from "@/lib/topics";
import { badRequest, readJson } from "@/lib/validate";

/** Starts a new recording. Video chunks are then appended with /api/stories/[id]/chunk. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { topic } = await readJson(req);
  if (!TOPICS.some((t) => t.id === topic)) return badRequest("Unknown topic");
  return Response.json({ id: createStory(user.id, topic as string) });
}
