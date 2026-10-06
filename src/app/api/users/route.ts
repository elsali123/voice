import fs from "node:fs";
import { after } from "next/server";
import { createUser, updateUser } from "@/lib/db";
import { decodeJpegDataUrl, photoFile } from "@/lib/files";
import { suggestMatchesFor } from "@/lib/matching";
import { AGE_GROUPS, BACKGROUNDS } from "@/lib/roles";
import { startSession } from "@/lib/session";
import type { Role } from "@/lib/types";
import { badRequest, birthYear, isPin, readJson, text } from "@/lib/validate";

const ROLES: Role[] = ["storyteller", "listener", "coordinator"];

/** Creates a profile (the "I'm new here" wizard) and signs the person in. */
export async function POST(req: Request) {
  const body = await readJson(req);
  const role = ROLES.includes(body.role as Role) ? (body.role as Role) : "storyteller";
  const name = text(body.name, 80);
  if (!name) return badRequest("Please tell us your name.");
  if (!isPin(body.pin)) return badRequest("Please choose a 4-digit PIN.");

  if (role === "coordinator") {
    const code = process.env.COORDINATOR_CODE?.trim();
    if (!code) return badRequest("Coordinator sign-up is turned off. Set COORDINATOR_CODE in .env.local to turn it on.");
    if (text(body.coordinatorCode, 200) !== code) return badRequest("That coordinator code isn't right.");
  }

  const listener = role === "listener";
  const user = createUser({
    role,
    name,
    pin: body.pin,
    birthYear: role === "storyteller" ? birthYear(body.birthYear) : null,
    hometown: role === "storyteller" ? text(body.hometown) : "",
    work: role === "storyteller" ? text(body.work) : "",
    interests: role === "coordinator" ? "" : text(body.interests),
    about: role === "coordinator" ? "" : text(body.about, 1000),
    ageGroup: listener && AGE_GROUPS.some((a) => a.value === body.ageGroup) ? (body.ageGroup as string) : "",
    background: listener && BACKGROUNDS.includes(body.background as string) ? (body.background as string) : "",
    goals: listener ? text(body.goals, 500) : "",
  });

  const photo = decodeJpegDataUrl(body.photo);
  if (photo) {
    await fs.promises.writeFile(photoFile(user.id), photo);
    updateUser(user.id, { bumpPhoto: true });
  }

  // A new listener: have the matching agent suggest storytellers for the coordinator to review.
  if (listener) after(() => suggestMatchesFor(user).catch((err) => console.error("[matching]", err)));

  await startSession(user.id);
  return Response.json({ id: user.id, role });
}
