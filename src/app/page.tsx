import Link from "next/link";
import StoryCard from "@/components/StoryCard";
import Welcome from "@/components/Welcome";
import { listRecentStories, listStoriesByUser, listUsers, toPublicUser } from "@/lib/db";
import { recoverUnfinishedStories } from "@/lib/recovery";
import { currentUser } from "@/lib/session";
import { firstName } from "@/lib/voices";

export default async function Home() {
  const user = await currentUser();
  if (!user) return <Welcome people={listUsers().map(toPublicUser)} />;

  await recoverUnfinishedStories(user.id);
  const mine = listStoriesByUser(user.id, user.id);
  const others = listRecentStories(user.id);

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

      <section className="space-y-5">
        <h2 className="text-3xl font-bold">Your stories</h2>
        {mine.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((s) => (
              <StoryCard key={s.id} story={s} showAuthor={false} />
            ))}
          </div>
        ) : (
          <p className="rounded-3xl border-2 border-dashed border-line bg-card p-8 text-2xl text-ink-soft">
            Your recorded stories will appear here.
          </p>
        )}
      </section>

      <section className="space-y-5">
        <h2 className="text-3xl font-bold">Stories from others</h2>
        {others.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((s) => (
              <StoryCard key={s.id} story={s} />
            ))}
          </div>
        ) : (
          <p className="rounded-3xl border-2 border-dashed border-line bg-card p-8 text-2xl text-ink-soft">
            When others share their stories, you can watch them here.
          </p>
        )}
      </section>
    </div>
  );
}
