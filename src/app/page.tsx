import Link from "next/link";
import Avatar from "@/components/Avatar";
import StoryCard from "@/components/StoryCard";
import Welcome from "@/components/Welcome";
import { IconHeart } from "@/components/icons";
import { getUser, listMatches, listRecentStories, listStoriesByUser, listUsers, toPublicUser } from "@/lib/db";
import { interestScore } from "@/lib/matching";
import { recoverUnfinishedStories } from "@/lib/recovery";
import { listenerDescription, nameFor } from "@/lib/roles";
import { currentUser } from "@/lib/session";
import type { Story, User } from "@/lib/types";
import { firstName } from "@/lib/voices";

export default async function Home() {
  const user = await currentUser();
  if (!user) return <Welcome people={listUsers().map((u) => ({ ...toPublicUser(u), role: u.role }))} />;
  if (user.role === "listener") return <ListenerHome user={user} />;
  if (user.role === "coordinator") return <CoordinatorHome />;
  return <StorytellerHome user={user} />;
}

// ---------- storytellers ----------

async function StorytellerHome({ user }: { user: User }) {
  await recoverUnfinishedStories(user.id);
  const mine = listStoriesByUser(user.id, user.id);
  const others = listRecentStories(user.id);
  const listeners = listMatches({ storytellerId: user.id, status: "approved" }).flatMap((m) => {
    const listener = getUser(m.listenerId);
    return listener ? [{ match: m, listener }] : [];
  });

  return (
    <div className="space-y-12">
      <section className="flex flex-col items-start gap-6 rounded-3xl bg-brand p-8 text-white md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold">Hello, {firstName(user.name)}!</h1>
          <p className="max-w-2xl text-2xl">
            {mine.length ? "Ready to share another story?" : "Ready to share your first story?"} A friendly interviewer
            asks the questions. You just talk.
          </p>
        </div>
        <Link
          href="/record"
          className="flex shrink-0 items-center gap-3 rounded-2xl bg-rec px-8 py-5 text-2xl font-bold text-white shadow-lg ring-4 ring-white/30 hover:bg-rec-dark"
        >
          <span className="size-5 rounded-full bg-white" aria-hidden="true" /> Record a story
        </Link>
      </section>

      {listeners.length > 0 && (
        <section className="space-y-5">
          <h2 className="text-3xl font-bold">Young people listening to your stories</h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {listeners.map(({ match, listener }) => (
              <li key={match.id}>
                <Link href={`/people/${listener.id}`} className="flex gap-4 rounded-3xl border-2 border-line bg-card p-5 hover:border-brand">
                  <Avatar user={{ ...toPublicUser(listener), name: nameFor(listener, user) }} size={72} />
                  <div className="space-y-1">
                    <p className="text-2xl font-bold">{nameFor(listener, user)}</p>
                    {listenerDescription(listener) && <p className="text-lg text-ink-soft">{listenerDescription(listener)}</p>}
                    {match.reason && <p className="text-lg">{match.reason}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-5">
        <h2 className="text-3xl font-bold">Your stories</h2>
        {mine.length ? (
          <StoryGrid stories={mine} showAuthor={false} />
        ) : (
          <Empty>Your recorded stories will appear here.</Empty>
        )}
      </section>

      <section className="space-y-5">
        <h2 className="text-3xl font-bold">Stories from others</h2>
        {others.length ? <StoryGrid stories={others} /> : <Empty>When others share their stories, you can watch them here.</Empty>}
      </section>
    </div>
  );
}

// ---------- young listeners ----------

function ListenerHome({ user }: { user: User }) {
  const pairs = listMatches({ listenerId: user.id, status: "approved" }).flatMap((m) => {
    const storyteller = getUser(m.storytellerId);
    return storyteller ? [{ match: m, storyteller, stories: listStoriesByUser(storyteller.id, user.id) }] : [];
  });
  const pairedIds = new Set(pairs.map((p) => p.storyteller.id));
  const all = listRecentStories(user.id, 48);
  const forYou = all
    .filter((s) => !pairedIds.has(s.userId))
    .map((s) => ({ s, score: interestScore(user, `${s.title} ${s.summary} ${s.tags.join(" ")} ${s.topic}`) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => x.s);

  return (
    <div className="space-y-12">
      <section className="space-y-2 rounded-3xl bg-brand p-8 text-white">
        <h1 className="text-4xl font-bold">Hello, {firstName(user.name)}!</h1>
        <p className="max-w-3xl text-2xl">Watch older adults tell their life stories, in their own words, and learn from what they lived through.</p>
      </section>

      <section className="space-y-5">
        <h2 className="text-3xl font-bold">Your storytellers</h2>
        {pairs.length ? (
          pairs.map(({ match, storyteller, stories }) => (
            <div key={match.id} className="space-y-4 rounded-3xl border-2 border-line bg-card p-5">
              <Link href={`/people/${storyteller.id}`} className="flex items-center gap-4 rounded-2xl hover:bg-brand-soft">
                <Avatar user={toPublicUser(storyteller)} size={80} />
                <div className="space-y-1">
                  <p className="text-2xl font-bold">{storyteller.name}</p>
                  {match.reason && (
                    <p className="flex items-start gap-2 text-lg">
                      <IconHeart className="mt-1 size-5 shrink-0 text-rec" /> {match.reason}
                    </p>
                  )}
                </div>
              </Link>
              {stories.length ? (
                <StoryGrid stories={stories.slice(0, 3)} showAuthor={false} />
              ) : (
                <p className="text-xl text-ink-soft">{firstName(storyteller.name)} hasn&rsquo;t recorded a story yet.</p>
              )}
            </div>
          ))
        ) : (
          <Empty>
            Your coordinator is finding a storyteller who shares your interests. They&rsquo;ll appear here once your pairing is
            approved. Meanwhile, explore the stories below.
          </Empty>
        )}
      </section>

      {forYou.length > 0 && (
        <section className="space-y-5">
          <h2 className="text-3xl font-bold">Stories you might like</h2>
          <StoryGrid stories={forYou} />
        </section>
      )}

      <section className="space-y-5">
        <h2 className="text-3xl font-bold">All stories</h2>
        {all.length ? <StoryGrid stories={all} /> : <Empty>No stories have been shared yet.</Empty>}
      </section>
    </div>
  );
}

// ---------- coordinators ----------

function CoordinatorHome() {
  const waiting = listMatches({ status: "suggested" }).length;
  const stories = listRecentStories(null, 48);
  return (
    <div className="space-y-12">
      <section className="flex flex-col items-start gap-6 rounded-3xl bg-brand p-8 text-white md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold">Coordinator</h1>
          <p className="text-2xl">
            {waiting ? `${waiting} suggested pairing${waiting === 1 ? " is" : "s are"} waiting for your approval.` : "No pairings are waiting for approval."}
          </p>
        </div>
        <Link href="/coordinator" className="rounded-2xl bg-white px-8 py-5 text-2xl font-bold text-brand shadow-lg hover:bg-brand-soft">
          Review pairings
        </Link>
      </section>
      <section className="space-y-5">
        <h2 className="text-3xl font-bold">All stories</h2>
        {stories.length ? <StoryGrid stories={stories} /> : <Empty>No stories have been shared yet.</Empty>}
      </section>
    </div>
  );
}

// ---------- shared ----------

function StoryGrid({ stories, showAuthor = true }: { stories: Story[]; showAuthor?: boolean }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {stories.map((s) => (
        <StoryCard key={s.id} story={s} showAuthor={showAuthor} />
      ))}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-3xl border-2 border-dashed border-line bg-card p-8 text-2xl text-ink-soft">{children}</p>;
}
