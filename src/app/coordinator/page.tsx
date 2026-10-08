import { redirect } from "next/navigation";
import CoordinatorBoard, { type BoardMatch, type BoardPerson } from "@/components/CoordinatorBoard";
import { listMatches, listStoriesByUser, listUsersByRole, toPublicUser } from "@/lib/db";
import { matchJobStatus } from "@/lib/matching";
import { currentUser } from "@/lib/session";
import type { User } from "@/lib/types";

/** Coordinators review the matching agent's suggested pairings, approve or decline them, and pair people themselves. */
export default async function CoordinatorPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  if (user.role !== "coordinator") redirect("/");

  const listeners = listUsersByRole("listener").map(listenerCard);
  const storytellers = listUsersByRole("storyteller").map(storytellerCard);
  const people = new Map<string, BoardPerson>([...listeners, ...storytellers].map((p) => [p.id, p]));

  const matches: BoardMatch[] = listMatches().flatMap((m) => {
    const listener = people.get(m.listenerId);
    const storyteller = people.get(m.storytellerId);
    return listener && storyteller ? [{ ...m, listener, storyteller }] : [];
  });

  return (
    <CoordinatorBoard
      matches={matches}
      listeners={listeners}
      storytellers={storytellers}
      job={matchJobStatus()}
    />
  );
}

function listenerCard(u: User): BoardPerson {
  return {
    ...toPublicUser(u),
    role: "listener",
    lines: [
      ["Interests", u.interests],
      ["Wants to learn", u.goals],
      ["Note", u.about],
    ].filter(([, v]) => v) as [string, string][],
    background: u.background,
    ageGroup: u.ageGroup,
    tags: [],
    storyCount: 0,
  };
}

function storytellerCard(u: User): BoardPerson {
  const stories = listStoriesByUser(u.id, null).filter((s) => s.status === "ready");
  return {
    ...toPublicUser(u),
    role: "storyteller",
    lines: [
      ["Born", u.birthYear ? String(u.birthYear) : ""],
      ["Grew up in", u.hometown],
      ["Work", u.work],
      ["Enjoys", u.interests],
    ].filter(([, v]) => v) as [string, string][],
    background: "",
    ageGroup: "",
    tags: [...new Set(stories.flatMap((s) => s.tags))].slice(0, 8),
    storyCount: stories.length,
  };
}
