import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const DATA_DIR = path.join(process.cwd(), "data");
export const VIDEO_DIR = path.join(DATA_DIR, "videos");
export const THUMB_DIR = path.join(DATA_DIR, "thumbs");
export const PHOTO_DIR = path.join(DATA_DIR, "photos");

export function ensureDataDirs() {
  for (const dir of [DATA_DIR, VIDEO_DIR, THUMB_DIR, PHOTO_DIR]) fs.mkdirSync(dir, { recursive: true });
}

const ID_RE = /^[0-9a-f-]{36}$/;
export const isId = (id: string) => ID_RE.test(id);

export const videoFile = (storyId: string) => path.join(VIDEO_DIR, `${storyId}.webm`);
export const partialVideoFile = (storyId: string) => path.join(VIDEO_DIR, `${storyId}.partial.webm`);
export const thumbFile = (storyId: string) => path.join(THUMB_DIR, `${storyId}.jpg`);
export const photoFile = (userId: string) => path.join(PHOTO_DIR, `${userId}.jpg`);

/** Decodes a `data:image/jpeg;base64,...` URL produced by a canvas. */
export function decodeJpegDataUrl(dataUrl: unknown): Buffer | null {
  if (typeof dataUrl !== "string") return null;
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const buf = Buffer.from(match[1], "base64");
  return buf.length > 0 && buf.length < 5_000_000 ? buf : null;
}

/**
 * Browser recordings (MediaRecorder WebM) have no duration or seek index, so the
 * player can't show a timeline. Remuxing with ffmpeg (no re-encode, takes about a second)
 * fixes that. Without ffmpeg the raw recording is kept as-is.
 */
export async function finalizeVideo(storyId: string): Promise<void> {
  const raw = partialVideoFile(storyId);
  const out = videoFile(storyId);
  if (!fs.existsSync(raw)) return;
  try {
    await run(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-c", "copy", out]);
    await fs.promises.unlink(raw);
  } catch (err) {
    console.warn("[video] ffmpeg remux failed, keeping raw recording:", (err as Error).message);
    await fs.promises.rename(raw, out);
  }
}

/** Length of a video in seconds (0 if unknown or ffprobe isn't installed). */
export async function videoDuration(file: string): Promise<number> {
  try {
    const { stdout } = await run(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
    const seconds = parseFloat(stdout);
    return Number.isFinite(seconds) ? seconds : 0;
  } catch {
    return 0;
  }
}

export async function removeFiles(...files: string[]) {
  await Promise.all(files.map((f) => fs.promises.rm(f, { force: true })));
}
