import type { NextRequest } from "next/server";
import { deleteStory, getStory, updateStory } from "@/lib/db";
import { currentUser, unauthorized } from "@/lib/session";
import { readJson, text } from "@/lib/validate";

const notFound = () => Response.json({ error: "Story not found" }, { status: 404 });

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/stories/[id]">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  const story = getStory(id);
  if (!story || (story.visibility === "private" && story.userId !== user?.id)) return notFound();
  return Response.json({ id: story.id, status: story.status, title: story.title });
}

/** The storyteller can rename a story or change who can watch it. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/stories/[id]">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user) return unauthorized();
  const story = getStory(id);
  if (!story || story.userId !== user.id) return notFound();
  const body = await readJson(req);
  const title = body.title !== undefined ? text(body.title, 90) : undefined;
  const visibility = body.visibility === "private" || body.visibility === "everyone" ? body.visibility : undefined;
  updateStory(id, { title: title || undefined, visibility });
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/stories/[id]">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user) return unauthorized();
  const story = getStory(id);
  if (!story || story.userId !== user.id) return notFound();
  await deleteStory(id);
  return Response.json({ ok: true });
}
