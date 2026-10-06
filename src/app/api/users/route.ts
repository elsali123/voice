import fs from "node:fs";
import { createUser, updateUser } from "@/lib/db";
import { decodeJpegDataUrl, photoFile } from "@/lib/files";
import { startSession } from "@/lib/session";
import { badRequest, birthYear, isPin, readJson, text } from "@/lib/validate";

/** Creates a storyteller profile (the "I'm new here" wizard) and signs them in. */
export async function POST(req: Request) {
  const body = await readJson(req);
  const name = text(body.name, 80);
  if (!name) return badRequest("Please tell us your name.");
  if (!isPin(body.pin)) return badRequest("Please choose a 4-digit PIN.");

  const user = createUser({
    name,
    pin: body.pin,
    birthYear: birthYear(body.birthYear),
    hometown: text(body.hometown),
    work: text(body.work),
    interests: text(body.interests),
    about: text(body.about, 1000),
  });

  const photo = decodeJpegDataUrl(body.photo);
  if (photo) {
    await fs.promises.writeFile(photoFile(user.id), photo);
    updateUser(user.id, { bumpPhoto: true });
  }

  await startSession(user.id);
  return Response.json({ id: user.id });
}
