import { getUser, pairDirectly } from "@/lib/db";
import { coordinatorsOnly, currentCoordinator } from "@/lib/coordinator";
import { badRequest, readJson, text } from "@/lib/validate";

/** A coordinator pairs a listener with a storyteller directly. */
export async function POST(req: Request) {
  const coordinator = await currentCoordinator();
  if (!coordinator) return coordinatorsOnly();
  const body = await readJson(req);
  const listener = typeof body.listenerId === "string" ? getUser(body.listenerId) : null;
  const storyteller = typeof body.storytellerId === "string" ? getUser(body.storytellerId) : null;
  if (listener?.role !== "listener" || storyteller?.role !== "storyteller") return badRequest("Please choose a listener and a storyteller.");
  pairDirectly(listener.id, storyteller.id, text(body.reason, 300), coordinator.id);
  return Response.json({ ok: true });
}
