import { verifyPin } from "@/lib/db";
import { startSession } from "@/lib/session";
import { badRequest, isPin, readJson } from "@/lib/validate";

export async function POST(req: Request) {
  const { userId, pin } = await readJson(req);
  if (typeof userId !== "string" || !isPin(pin)) return badRequest("Please enter your 4-digit PIN.");
  if (!verifyPin(userId, pin)) return Response.json({ error: "That PIN didn't match. Please try again." }, { status: 401 });
  await startSession(userId);
  return Response.json({ ok: true });
}
