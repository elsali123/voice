import Link from "next/link";
import Avatar from "./Avatar";
import { IconPlay } from "./icons";
import { formatDate, formatDuration } from "@/lib/format";
import { topicById } from "@/lib/topics";
import type { Story } from "@/lib/types";

export default function StoryCard({ story, showAuthor = true }: { story: Story; showAuthor?: boolean }) {
  const topic = topicById(story.topic);
  return (
    <Link
      href={`/stories/${story.id}`}
      className="group block overflow-hidden rounded-3xl border-2 border-line bg-card shadow-sm transition hover:border-brand hover:shadow-md"
    >
      <div className="relative aspect-video bg-brand-soft">
        {story.hasThumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- local thumbnail
          <img src={`/api/media/thumb/${story.id}`} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full place-items-center text-6xl" aria-hidden="true">
            {topic.emoji}
          </span>
        )}
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid size-16 place-items-center rounded-full bg-black/60 text-white transition group-hover:scale-110 group-hover:bg-brand">
            <IconPlay className="ml-1 size-8" />
          </span>
        </span>
        <span className="absolute right-3 bottom-3 rounded-lg bg-black/75 px-2 py-0.5 text-base font-bold text-white">
          {formatDuration(story.durationSec)}
        </span>
        {story.visibility === "private" && (
          <span className="absolute top-3 left-3 rounded-lg bg-ink/85 px-2 py-0.5 text-base font-bold text-white">Only me</span>
        )}
      </div>
      <div className="space-y-2 p-4">
        <h3 className="text-xl leading-snug font-bold">{story.title || "New story"}</h3>
        {showAuthor && (
          <div className="flex items-center gap-2">
            <Avatar user={story.author} size={36} />
            <span className="font-bold">{story.author.name}</span>
          </div>
        )}
        <p className="text-ink-soft">
          {topic.label} · {formatDate(story.createdAt)}
        </p>
      </div>
    </Link>
  );
}
