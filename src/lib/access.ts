import { approvedMatchBetween } from "./db";
import type { User } from "./types";

/**
 * A listener's profile and photo can be seen only by the listener, coordinators, and storytellers
 * a coordinator has paired them with. Everyone else's are visible to anyone signed in.
 */
export function canSeePerson(person: Pick<User, "id" | "role">, viewer: Pick<User, "id" | "role"> | null): boolean {
  if (person.role !== "listener") return true;
  if (!viewer) return false;
  return viewer.id === person.id || viewer.role === "coordinator" || !!approvedMatchBetween(person.id, viewer.id);
}
