import fs from "node:fs";
import type { NextRequest } from "next/server";
import { canSeePerson } from "@/lib/access";
import { getStory, getUser } from "@/lib/db";
import { isId, photoFile, thumbFile, videoFile } from "@/lib/files";
import { currentUser } from "@/lib/session";

const notFound = () => new Response("Not found", { status: 404 });

/**
 * Streams bytes [start, end] of a file, reading only as fast as the browser consumes them.
 * Video players cancel requests constantly while seeking; cancelling just closes the file.
 */
async function fileStream(file: string, start: number, end: number): Promise<ReadableStream<Uint8Array>> {
  const handle = await fs.promises.open(file, "r");
  let position = start;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await handle.close().catch(() => {});
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const length = Math.min(256 * 1024, end - position + 1);
        const { bytesRead, buffer } = length > 0 ? await handle.read(new Uint8Array(length), 0, length, position) : { bytesRead: 0, buffer: null };
        if (!bytesRead || !buffer) {
          await close();
          controller.close();
          return;
        }
        position += bytesRead;
        controller.enqueue(buffer.subarray(0, bytesRead));
      } catch (err) {
        await close();
        controller.error(err);
      }
    },
    cancel: close,
  });
}

/** Serves recorded videos (with byte ranges, so the player can seek), thumbnails and profile photos. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/media/[kind]/[id]">) {
  const { kind, id } = await ctx.params;
  if (!isId(id)) return notFound();

  let file: string;
  let type: string;
  if (kind === "photo") {
    const person = getUser(id);
    if (!person || !canSeePerson(person, await currentUser())) return notFound();
    file = photoFile(id);
    type = "image/jpeg";
  } else if (kind === "video" || kind === "thumb") {
    const story = getStory(id);
    if (!story) return notFound();
    if (story.visibility === "private" && (await currentUser())?.id !== story.userId) return notFound();
    file = kind === "video" ? videoFile(id) : thumbFile(id);
    type = kind === "video" ? "video/webm" : "image/jpeg";
  } else {
    return notFound();
  }

  const stat = await fs.promises.stat(file).catch(() => null);
  if (!stat) return notFound();
  const size = stat.size;
  const headers: Record<string, string> = { "content-type": type, "accept-ranges": "bytes", "cache-control": "private, max-age=0, must-revalidate" };

  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") ?? "");
  if (!range) {
    return new Response(await fileStream(file, 0, size - 1), { headers: { ...headers, "content-length": String(size) } });
  }

  let start = range[1] ? parseInt(range[1], 10) : 0;
  let end = range[2] ? Math.min(parseInt(range[2], 10), size - 1) : size - 1;
  if (!range[1] && range[2]) {
    start = Math.max(0, size - parseInt(range[2], 10));
    end = size - 1;
  }
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  }
  return new Response(await fileStream(file, start, end), {
    status: 206,
    headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
  });
}
