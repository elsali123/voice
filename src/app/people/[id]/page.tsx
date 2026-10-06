import { notFound, redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import StoryCard from "@/components/StoryCard";
import { getUser, listStoriesByUser, toPublicUser } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { firstName } from "@/lib/voices";

/** A storyteller's "channel": who they are and all their stories. */
export default async function PersonPage(props: PageProps<"/people/[id]">) {
  const { id } = await props.params;
  const viewer = await currentUser();
  if (!viewer) redirect("/");
  const person = getUser(id);
  if (!person) notFound();
  const stories = listStoriesByUser(person.id, viewer.id);
  const facts = [
    person.birthYear && `Born in ${person.birthYear}`,
    person.hometown && `Grew up in ${person.hometown}`,
    person.work && `Work: ${person.work}`,
    person.interests && `Enjoys ${person.interests}`,
  ].filter(Boolean);

  return (
    <div className="space-y-10">
      <section className="flex flex-col items-center gap-6 rounded-3xl border-2 border-line bg-card p-8 text-center sm:flex-row sm:text-left">
        <Avatar user={toPublicUser(person)} size={140} />
        <div className="space-y-2">
          <h1 className="text-4xl font-bold">{person.name}</h1>
          {facts.map((f) => (
            <p key={String(f)} className="text-xl">
              {f}
            </p>
          ))}
          {person.about && <p className="text-xl text-ink-soft">{person.about}</p>}
        </div>
      </section>
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
    </div>
  );
}
