"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Avatar from "./Avatar";
import { IconCheck, IconHeart } from "./icons";
import type { MatchJob } from "@/lib/matching";
import { ageGroupLabel } from "@/lib/roles";
import type { Match, MatchStatus, PublicUser } from "@/lib/types";

export interface BoardPerson extends PublicUser {
  role: "listener" | "storyteller";
  lines: [string, string][];
  background: string;
  ageGroup: string;
  tags: string[];
  storyCount: number;
}

export interface BoardMatch extends Match {
  listener: BoardPerson;
  storyteller: BoardPerson;
}

const SOURCE_LABELS: Record<Match["source"], string> = {
  ai: "Suggested by the matching agent",
  keywords: "Suggested from shared interests",
  coordinator: "Paired by a coordinator",
};

export default function CoordinatorBoard({
  matches,
  listeners,
  storytellers,
  job: initialJob,
}: {
  matches: BoardMatch[];
  listeners: BoardPerson[];
  storytellers: BoardPerson[];
  job: MatchJob | null;
}) {
  const router = useRouter();
  const [job, setJob] = useState<MatchJob | null>(initialJob);
  const [busy, setBusy] = useState<string | null>(null);

  const suggested = matches.filter((m) => m.status === "suggested");
  const approved = matches.filter((m) => m.status === "approved");
  const declined = matches.filter((m) => m.status === "declined");

  // While the matching agent works, check on it every couple of seconds.
  useEffect(() => {
    if (!job?.running) return;
    const timer = setInterval(async () => {
      const res = await fetch("/api/matches/suggest").catch(() => null);
      const next = res?.ok ? ((await res.json()) as MatchJob | null) : null;
      if (!next) return;
      setJob(next);
      if (!next.running) router.refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [job?.running, router]);

  const findMatches = async () => {
    const res = await fetch("/api/matches/suggest", { method: "POST" });
    if (res.ok) setJob((await res.json()) as MatchJob);
  };

  const decide = async (id: string, status: MatchStatus) => {
    setBusy(id);
    await fetch(`/api/matches/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    router.refresh();
    setBusy(null);
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Pairings</h1>
          <p className="text-xl text-ink-soft">
            {storytellers.length} storyteller{storytellers.length === 1 ? "" : "s"} · {listeners.length} listener{listeners.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="space-y-2 md:text-right">
          <button
            type="button"
            onClick={findMatches}
            disabled={job?.running || !listeners.length || !storytellers.length}
            className="rounded-2xl bg-brand px-6 py-4 text-xl font-bold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {job?.running ? "The matching agent is working…" : "Find new matches"}
          </button>
          <p className="text-lg text-ink-soft" role="status">
            {job?.running
              ? `Looking at listener ${Math.min(job.listenersChecked + 1, job.listenersTotal)} of ${job.listenersTotal}. This can take a minute.`
              : job?.finishedAt
                ? `Last run found ${job.suggested} new suggestion${job.suggested === 1 ? "" : "s"}.`
                : "The agent suggests storytellers for each listener. Nothing is shared until you approve."}
          </p>
        </div>
      </div>

      <Section title={`Waiting for your approval (${suggested.length})`}>
        {suggested.length ? (
          suggested.map((m) => (
            <MatchCard key={m.id} match={m}>
              <button
                type="button"
                disabled={busy === m.id}
                onClick={() => decide(m.id, "approved")}
                className="flex items-center gap-2 rounded-2xl bg-ok px-6 py-3 text-xl font-bold text-white hover:bg-ok-dark disabled:opacity-50"
              >
                <IconCheck className="size-6" /> Approve pairing
              </button>
              <button
                type="button"
                disabled={busy === m.id}
                onClick={() => decide(m.id, "declined")}
                className="rounded-2xl border-2 border-line bg-card px-6 py-3 text-xl font-bold hover:border-rec disabled:opacity-50"
              >
                Decline
              </button>
            </MatchCard>
          ))
        ) : (
          <Empty>
            {listeners.length ? "No suggestions waiting. Press “Find new matches” to ask the agent for more." : "No listeners have signed up yet."}
          </Empty>
        )}
      </Section>

      <Section title={`Approved pairings (${approved.length})`}>
        {approved.length ? (
          approved.map((m) => (
            <MatchCard key={m.id} match={m}>
              <button
                type="button"
                disabled={busy === m.id}
                onClick={() => decide(m.id, "declined")}
                className="rounded-2xl border-2 border-line bg-card px-6 py-3 text-xl font-bold hover:border-rec disabled:opacity-50"
              >
                End pairing
              </button>
            </MatchCard>
          ))
        ) : (
          <Empty>Approved pairings appear here. Both people can then see each other.</Empty>
        )}
      </Section>

      <PairYourself listeners={listeners} storytellers={storytellers} onDone={() => router.refresh()} />

      {declined.length > 0 && (
        <details className="rounded-3xl border-2 border-line bg-card p-5">
          <summary className="cursor-pointer text-2xl font-bold">Declined or ended ({declined.length})</summary>
          <div className="mt-5 space-y-5">
            {declined.map((m) => (
              <MatchCard key={m.id} match={m}>
                <button
                  type="button"
                  disabled={busy === m.id}
                  onClick={() => decide(m.id, "approved")}
                  className="rounded-2xl border-2 border-line bg-card px-6 py-3 text-xl font-bold hover:border-ok disabled:opacity-50"
                >
                  Approve after all
                </button>
              </MatchCard>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function MatchCard({ match, children }: { match: BoardMatch; children: React.ReactNode }) {
  return (
    <article className="space-y-5 rounded-3xl border-2 border-line bg-card p-5">
      <div className="grid items-start gap-4 md:grid-cols-[1fr_auto_1fr]">
        <PersonPanel person={match.listener} />
        <span className="hidden self-center text-rec md:block" aria-hidden="true">
          <IconHeart className="size-10" />
        </span>
        <PersonPanel person={match.storyteller} />
      </div>
      <div className="space-y-2 rounded-2xl bg-brand-soft p-4">
        {match.reason && <p className="text-xl">{match.reason}</p>}
        {match.shared.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="In common">
            {match.shared.map((s) => (
              <li key={s} className="rounded-full bg-card px-3 py-1 text-lg font-bold text-brand">
                {s}
              </li>
            ))}
          </ul>
        )}
        <p className="text-base text-ink-soft">{SOURCE_LABELS[match.source]}</p>
      </div>
      <div className="flex flex-wrap gap-3">{children}</div>
    </article>
  );
}

function PersonPanel({ person }: { person: BoardPerson }) {
  const under18 = person.role === "listener" && person.ageGroup === "under18";
  return (
    <div className="flex gap-4">
      <Avatar user={person} size={64} />
      <div className="min-w-0 space-y-1">
        <p className="text-base font-bold tracking-wide text-ink-soft uppercase">{person.role === "listener" ? "Listener" : "Storyteller"}</p>
        <Link href={`/people/${person.id}`} className="text-2xl font-bold hover:underline">
          {person.name}
        </Link>
        {person.role === "listener" && (
          <p className="flex flex-wrap items-center gap-2 text-lg">
            {person.background}
            {person.ageGroup && (
              <span className={`rounded-lg px-2 py-0.5 font-bold ${under18 ? "border-2 border-warn-line bg-warn-soft" : "bg-paper"}`}>
                {ageGroupLabel(person.ageGroup)}
              </span>
            )}
          </p>
        )}
        {person.lines.map(([label, value]) => (
          <p key={label} className="text-lg">
            <span className="font-bold">{label}:</span> {value}
          </p>
        ))}
        {person.role === "storyteller" && (
          <p className="text-lg text-ink-soft">
            {person.storyCount} stor{person.storyCount === 1 ? "y" : "ies"}
            {person.tags.length > 0 && `: ${person.tags.join(", ")}`}
          </p>
        )}
      </div>
    </div>
  );
}

function PairYourself({ listeners, storytellers, onDone }: { listeners: BoardPerson[]; storytellers: BoardPerson[]; onDone: () => void }) {
  const [listenerId, setListenerId] = useState("");
  const [storytellerId, setStorytellerId] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listenerId, storytellerId, reason }),
    });
    if (!res.ok) return setMessage(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong.");
    setMessage("Paired ✓");
    setListenerId("");
    setStorytellerId("");
    setReason("");
    onDone();
  };

  return (
    <Section title="Pair two people yourself">
      <form
        className="space-y-4 rounded-3xl border-2 border-line bg-card p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-lg text-ink-soft">For example, a grandchild and their grandparent. The pairing is approved right away.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <PersonSelect label="Listener" value={listenerId} onChange={setListenerId} people={listeners} />
          <PersonSelect label="Storyteller" value={storytellerId} onChange={setStorytellerId} people={storytellers} />
        </div>
        <label className="block space-y-1">
          <span className="text-xl font-bold">Why are they a good pair? (optional)</span>
          <input
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder="For example: Jamie is Margaret's grandson."
            className="w-full rounded-xl border-2 border-line px-4 py-3 text-xl focus:border-brand focus:outline-none"
          />
        </label>
        <div className="flex items-center gap-4">
          <button type="submit" disabled={!listenerId || !storytellerId} className="rounded-2xl bg-brand px-6 py-3 text-xl font-bold text-white disabled:opacity-50">
            Pair them
          </button>
          {message && (
            <p className="text-xl font-bold" role="status">
              {message}
            </p>
          )}
        </div>
      </form>
    </Section>
  );
}

function PersonSelect({ label, value, onChange, people }: { label: string; value: string; onChange: (v: string) => void; people: BoardPerson[] }) {
  return (
    <label className="block space-y-1">
      <span className="text-xl font-bold">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-line bg-card px-4 py-3 text-xl focus:border-brand focus:outline-none"
      >
        <option value="">Choose…</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.role === "listener" && p.ageGroup ? ` (${ageGroupLabel(p.ageGroup)})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-3xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-3xl border-2 border-dashed border-line bg-card p-6 text-xl text-ink-soft">{children}</p>;
}
