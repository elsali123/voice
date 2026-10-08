import { notFound, redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import StoryCard from "@/components/StoryCard";
import { IconHeart } from "@/components/icons";
import { approvedMatchBetween, getUser, listStoriesByUser, toPublicUser } from "@/lib/db";
import { isUnder18, listenerDescription, nameFor, ROLE_LABELS } from "@/lib/roles";
import { currentUser } from "@/lib/session";
import { firstName } from "@/lib/voices";

/**
 * A person's page. Storytellers' pages (their "channel") are visible to everyone signed in.
 * A young listener's page is visible only to themselves, coordinators and the storytellers
 * a coordinator has paired them with.
 */
export default async function PersonPage(props: PageProps<"/people/[id]">) {
  const { id } = await props.params;
  const viewer = await currentUser();
  if (!viewer) redirect("/");
  const person = getUser(id);
  if (!person) notFound();

  const pairing = person.id !== viewer.id ? approvedMatchBetween(person.id, viewer.id) : null;
  if (person.role === "listener" && viewer.id !== person.id && viewer.role !== "coordinator" && !pairing) notFound();

  const name = nameFor(person, viewer);

  const facts =
    person.role === "storyteller"
      ? [
          person.birthYear && `Born in ${person.birthYear}`,
          person.hometown && `Grew up in ${person.hometown}`,
          person.work && `Work: ${person.work}`,
          person.interests && `Enjoys ${person.interests}`,
        ]
      : person.role === "listener"
        ? [
            listenerDescription(person),
            person.interests && `Interested in ${person.interests}`,
            person.goals && `Would love to learn: ${person.goals}`,
          ]
        : [ROLE_LABELS[person.role]];
  const stories = person.role === "storyteller" ? listStoriesByUser(person.id, viewer.id) : [];

  return (
    <div className="space-y-10">
      <section className="flex flex-col items-center gap-6 rounded-3xl border-2 border-line bg-card p-8 text-center sm:flex-row sm:text-left">
        <Avatar user={{ ...toPublicUser(person), name }} size={140} />
        <div className="space-y-2">
          <p className="text-lg font-bold tracking-wide text-ink-soft uppercase">{ROLE_LABELS[person.role]}</p>
          <h1 className="text-4xl font-bold">{name}</h1>
          {facts.filter(Boolean).map((f) => (
            <p key={String(f)} className="text-xl">
              {f}
            </p>
          ))}
          {person.role === "storyteller" && person.about && <p className="text-xl text-ink-soft">{person.about}</p>}
          {viewer.role === "coordinator" && isUnder18(person) && (
            <p className="inline-block rounded-xl border-2 border-warn-line bg-warn-soft px-3 py-1 text-lg font-bold">Under 18</p>
          )}
        </div>
      </section>

      {pairing?.reason && (
        <p className="flex items-start gap-3 rounded-3xl bg-brand-soft p-5 text-xl">
          <IconHeart className="mt-1 size-6 shrink-0 text-rec" />
          <span>
            <strong>Why you were paired:</strong> {pairing.reason}
          </span>
        </p>
      )}

      {person.role === "storyteller" && (
        <section className="space-y-5">
          <h2 className="text-3xl font-bold">
            {firstName(person.name)}&rsquo;s stories ({stories.length})
          </h2>
          {stories.length ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {stories.map((s) => (
                <StoryCard key={s.id} story={s} showAuthor={false} />
              ))}
            </div>
          ) : (
            <p className="text-2xl text-ink-soft">No stories yet.</p>
          )}
        </section>
      )}
    </div>
  );
}
