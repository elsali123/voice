import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Avatar from "@/components/Avatar";
import StatusPoller from "@/components/StatusPoller";
import StoryOwnerControls from "@/components/StoryOwnerControls";
import StoryPlayer from "@/components/StoryPlayer";
import { getStory } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { currentUser } from "@/lib/session";
import { topicById } from "@/lib/topics";
import { firstName } from "@/lib/voices";

export default async function StoryPage(props: PageProps<"/stories/[id]">) {
  const { id } = await props.params;
  const user = await currentUser();
  if (!user) redirect("/");
  const story = getStory(id);
  if (!story || story.status === "recording" || (story.visibility === "private" && story.userId !== user.id)) notFound();

  const isOwner = story.userId === user.id;
  const processing = story.status === "processing";
  const topic = topicById(story.topic);

  return (
    <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-4">
        <h1 className="text-4xl leading-tight font-bold">{story.title || "Your new story"}</h1>
        <StoryPlayer storyId={story.id} events={story.events} storyteller={firstName(story.author.name)} />
      </div>

      <aside className="space-y-6">
        <Link href={`/people/${story.author.id}`} className="flex items-center gap-4 rounded-3xl border-2 border-line bg-card p-4 hover:border-brand">
          <Avatar user={story.author} size={72} />
          <span>
            <span className="block text-2xl font-bold">{story.author.name}</span>
            <span className="text-lg text-ink-soft">See all their stories</span>
          </span>
        </Link>

        <section className="space-y-3 rounded-3xl border-2 border-line bg-card p-5">
          <p className="text-lg text-ink-soft">
            {topic.emoji} {topic.label} · {formatDate(story.createdAt)}
          </p>
          {processing ? (
            <p className="text-xl" role="status">
              <span className="mr-2 inline-block size-5 animate-spin rounded-full border-4 border-brand-soft border-t-brand align-middle" aria-hidden="true" />
              Writing a title and summary…
            </p>
          ) : (
            story.summary && <p className="text-xl">{story.summary}</p>
          )}
          {story.tags.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Topics in this story">
              {story.tags.map((t) => (
                <li key={t} className="rounded-full bg-brand-soft px-3 py-1 text-lg font-bold text-brand">
                  {t}
                </li>
              ))}
            </ul>
          )}
        </section>

        {isOwner && <StoryOwnerControls storyId={story.id} title={story.title} visibility={story.visibility} />}
      </aside>

      {processing && <StatusPoller storyId={story.id} />}
    </div>
  );
}
