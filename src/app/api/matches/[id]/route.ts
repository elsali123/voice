import type { NextRequest } from "next/server";
import { decideMatch, getMatch } from "@/lib/db";
import { coordinatorsOnly, currentCoordinator } from "@/lib/coordinator";
import type { MatchStatus } from "@/lib/types";
import { badRequest, readJson } from "@/lib/validate";

const STATUSES: MatchStatus[] = ["approved", "declined", "suggested"];

/** A coordinator approves or declines a pairing (or ends / restores one). */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/matches/[id]">) {
  const coordinator = await currentCoordinator();
  if (!coordinator) return coordinatorsOnly();
  const { id } = await ctx.params;
  if (!getMatch(id)) return Response.json({ error: "Pairing not found" }, { status: 404 });
  const { status } = await readJson(req);
  if (!STATUSES.includes(status as MatchStatus)) return badRequest("Unknown status");
  decideMatch(id, status as MatchStatus, coordinator.id);
  return Response.json({ ok: true });
}
