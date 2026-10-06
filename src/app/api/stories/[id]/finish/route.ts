import fs from "node:fs";
import { after, type NextRequest } from "next/server";
import { getStory, updateStory } from "@/lib/db";
import { decodeJpegDataUrl, finalizeVideo, thumbFile } from "@/lib/files";
import { summarizeStory } from "@/lib/interviewer";
import { currentUser, unauthorized } from "@/lib/session";
import type { Segment, StoryEvent } from "@/lib/types";
import { readJson } from "@/lib/validate";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0);

function cleanEvents(raw: unknown): StoryEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && (e.kind === "question" || e.kind === "answer") && typeof e.text === "string")
    .slice(0, 1000)
    .map((e) => ({
      kind: e.kind,
      t: num(e.t),
      end: num(e.end),
      text: e.text.slice(0, 20000),
      segments: Array.isArray(e.segments)
        ? e.segments
            .filter((s: Segment) => s && typeof s.text === "string")
            .map((s: Segment) => ({ t0: num(s.t0), t1: num(s.t1), text: s.text.slice(0, 2000) }))
        : undefined,
    }));
}

/** Ends a recording: fixes up the video file, saves the transcript, then writes a summary in the background. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/stories/[id]/finish">) {
  const { id } = await ctx.params;
  const user = await currentUser();
  if (!user) return unauthorized();
  const story = getStory(id);
  if (!story || story.userId !== user.id) return Response.json({ error: "Story not found" }, { status: 404 });
  if (story.status !== "recording") return Response.json({ ok: true });

  const body = await readJson(req);
  const events = cleanEvents(body.events);
  await finalizeVideo(id);

  const thumb = decodeJpegDataUrl(body.thumbnail);
  if (thumb) await fs.promises.writeFile(thumbFile(id), thumb);

  updateStory(id, { events, durationSec: num(body.durationSec), hasThumb: !!thumb, status: "processing" });

  after(async () => {
    try {
      const summary = await summarizeStory(user, story.topic, events);
      updateStory(id, { ...summary, status: "ready" });
    } catch (err) {
      console.error("[summary] failed:", err);
      updateStory(id, { status: "ready" });
    }
  });

  return Response.json({ ok: true });
}
