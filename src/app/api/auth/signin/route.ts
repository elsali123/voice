import { getUser, verifyPin } from "@/lib/db";
import { clearWrongPins, lockedFor, recordWrongPin } from "@/lib/pin-limit";
import { startSession } from "@/lib/session";
import { badRequest, isPin, readJson } from "@/lib/validate";

const tooManyTries = (ms: number) => {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return Response.json(
    { error: `Too many wrong tries. Please wait ${minutes} minute${minutes === 1 ? "" : "s"}, then try again.` },
    { status: 429 },
  );
};

export async function POST(req: Request) {
  const { userId, pin } = await readJson(req);
  if (typeof userId !== "string" || !isPin(pin)) return badRequest("Please enter your 4-digit PIN.");
  if (!getUser(userId)) return Response.json({ error: "We couldn't find that person." }, { status: 404 });

  const locked = lockedFor(userId);
  if (locked) return tooManyTries(locked);
  if (!verifyPin(userId, pin)) {
    if (recordWrongPin(userId)) return tooManyTries(lockedFor(userId));
    return Response.json({ error: "That PIN didn't match. Please try again." }, { status: 401 });
  }

  clearWrongPins(userId);
  await startSession(userId);
  return Response.json({ ok: true });
}
