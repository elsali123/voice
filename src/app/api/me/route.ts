import fs from "node:fs";
import { updateUser } from "@/lib/db";
import { decodeJpegDataUrl, photoFile } from "@/lib/files";
import { currentUser, unauthorized } from "@/lib/session";
import type { PauseWait } from "@/lib/types";
import { badRequest, birthYear, readJson, text } from "@/lib/validate";
import { isVoiceId, PAUSE_WAITS } from "@/lib/voices";

/** Updates the signed-in person's profile, photo and interviewer settings. */
export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = await readJson(req);

  const patch: Parameters<typeof updateUser>[1] = {};
  if (body.name !== undefined) {
    const name = text(body.name, 80);
    if (!name) return badRequest("Your name can't be empty.");
    patch.name = name;
  }
  if (body.birthYear !== undefined) patch.birthYear = birthYear(body.birthYear);
  for (const key of ["hometown", "work", "interests"] as const) {
    if (body[key] !== undefined) patch[key] = text(body[key]);
  }
  if (body.about !== undefined) patch.about = text(body.about, 1000);

  const s = body.settings as Record<string, unknown> | undefined;
  if (s && typeof s === "object") {
    patch.settings = {
      voice: isVoiceId(s.voice) ? s.voice : user.settings.voice,
      speed: typeof s.speed === "number" ? Math.min(1.2, Math.max(0.7, s.speed)) : user.settings.speed,
      pauseWait: PAUSE_WAITS.some((p) => p.value === s.pauseWait) ? (s.pauseWait as PauseWait) : user.settings.pauseWait,
    };
  }

  if (body.photo !== undefined) {
    const photo = decodeJpegDataUrl(body.photo);
    if (!photo) return badRequest("That picture didn't work. Please try again.");
    await fs.promises.writeFile(photoFile(user.id), photo);
    patch.bumpPhoto = true;
  }
  if (body.removePhoto === true) {
    await fs.promises.rm(photoFile(user.id), { force: true });
    patch.removePhoto = true;
  }

  updateUser(user.id, patch);
  return Response.json({ ok: true });
}
