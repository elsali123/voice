import type { Role, User } from "./types";
import { firstName } from "./voices";

export const AGE_GROUPS = [
  { value: "under18", label: "Under 18" },
  { value: "18to24", label: "18 to 24" },
  { value: "25plus", label: "25 or older" },
];

export const BACKGROUNDS = [
  "High school student",
  "College student",
  "Volunteer",
  "Grandchild or family member",
  "Other",
];

export const ROLE_LABELS: Record<Role, string> = {
  storyteller: "Storyteller",
  listener: "Listener",
  coordinator: "Coordinator",
};

export const isUnder18 = (u: Pick<User, "role" | "ageGroup">) => u.role === "listener" && u.ageGroup === "under18";

export const ageGroupLabel = (value: string) => AGE_GROUPS.find((a) => a.value === value)?.label ?? "";

/** "High school student · Under 18" */
export function listenerDescription(u: Pick<User, "background" | "ageGroup">): string {
  return [u.background, ageGroupLabel(u.ageGroup)].filter(Boolean).join(" · ");
}

/** On the shared sign-in screen, listeners under 18 appear as "Jamie R." */
export function signInName(u: Pick<User, "name" | "role" | "ageGroup">): string {
  if (!isUnder18(u)) return u.name;
  const parts = u.name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

/** Young listeners under 18 are shown by first name only to anyone but themselves and coordinators. */
export function nameFor(person: Pick<User, "id" | "name" | "role" | "ageGroup">, viewer: Pick<User, "id" | "role"> | null): string {
  if (!isUnder18(person) || viewer?.id === person.id || viewer?.role === "coordinator") return person.name;
  return firstName(person.name);
}
