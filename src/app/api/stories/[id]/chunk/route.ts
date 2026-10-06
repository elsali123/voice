import fs from "node:fs";
import type { NextRequest } from "next/server";
import { getStory } from "@/lib/db";
import { partialVideoFile } from "@/lib/files";
import { currentUser, unauthorized } from "@/lib/session";

/**
 * The browser uploads the recording every few seconds while the interview runs,
 * so nothing is lost if the window is closed or the computer crashes.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/stories/[id]/chunk">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user) return unauthorized();
  const story = getStory(id);
  if (!story || story.userId !== user.id || story.status !== "recording") {
    return Response.json({ error: "This recording can't be added to" }, { status: 409 });
  }
  const chunk = Buffer.from(await req.arrayBuffer());
  await fs.promises.appendFile(partialVideoFile(id), chunk);
  return Response.json({ ok: true });
}
