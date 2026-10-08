import fs from "node:fs";
import { deleteStory, listUnfinishedStories, updateStory } from "./db";
import { finalizeVideo, partialVideoFile, videoDuration, videoFile } from "./files";
import { topicById } from "./topics";

const STALE_MS = 2 * 60_000;
/** A summary normally takes well under a minute; after this long it was interrupted (e.g. a restart). */
const SUMMARY_TIMEOUT_MS = 10 * 60_000;

/**
 * Rescues recordings that were cut off before they could be saved properly (the window closed or
 * the computer crashed). The video was uploaded every few seconds, so almost all of it is kept.
 * A recording still in use is left alone: its file is updated every few seconds while recording,
 * and every 30 seconds while paused.
 */
export async function recoverUnfinishedStories(userId: string) {
  for (const story of listUnfinishedStories(userId)) {
    if (story.status === "processing") {
      const recordingEnded = Date.parse(story.createdAt) + story.durationSec * 1000;
      if (Date.now() - recordingEnded > SUMMARY_TIMEOUT_MS) {
        updateStory(story.id, { title: story.title || `${topicById(story.topic).label} story`, status: "ready" });
      }
      continue;
    }
    const partial = partialVideoFile(story.id);
    const stat = await fs.promises.stat(partial).catch(() => null);
    const lastActivity = stat ? stat.mtimeMs : Date.parse(story.createdAt);
    if (Date.now() - lastActivity < STALE_MS) continue;
    if (!stat || stat.size === 0) {
      await deleteStory(story.id); // nothing was recorded
      continue;
    }
    await finalizeVideo(story.id);
    updateStory(story.id, {
      title: story.title || `${topicById(story.topic).label} (unfinished recording)`,
      durationSec: await videoDuration(videoFile(story.id)),
      status: "ready",
    });
    console.log(`[recovery] saved unfinished recording ${story.id}`);
  }
}
