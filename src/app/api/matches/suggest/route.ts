import { coordinatorsOnly, currentCoordinator } from "@/lib/coordinator";
import { matchJobStatus, startMatchJob } from "@/lib/matching";

/** Asks the matching agent to look for new pairings for every listener (runs in the background). */
export async function POST() {
  if (!(await currentCoordinator())) return coordinatorsOnly();
  return Response.json(startMatchJob());
}

export async function GET() {
  if (!(await currentCoordinator())) return coordinatorsOnly();
  return Response.json(matchJobStatus());
}
