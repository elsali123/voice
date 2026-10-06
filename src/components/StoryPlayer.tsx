"use client";

import { useMemo, useRef, useState } from "react";
import { IconPause, IconPlay, IconRepeat } from "./icons";
import { formatDuration } from "@/lib/format";
import type { StoryEvent } from "@/lib/types";

interface Cue {
  start: number;
  end: number;
  who: string;
  text: string;
}

function buildCues(events: StoryEvent[], storyteller: string): Cue[] {
  const cues: Cue[] = [];
  for (const e of events) {
    if (e.kind === "question") cues.push({ start: e.t, end: e.end, who: "Interviewer", text: e.text });
    else if (e.segments?.length) for (const s of e.segments) cues.push({ start: s.t0, end: s.t1, who: storyteller, text: s.text });
    else if (e.text) cues.push({ start: e.t, end: e.end, who: storyteller, text: e.text });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/** Video with large captions below it, big controls, and a list of the questions to jump to. */
export default function StoryPlayer({ storyId, events, storyteller }: { storyId: string; events: StoryEvent[]; storyteller: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [captions, setCaptions] = useState(true);

  const cues = useMemo(() => buildCues(events, storyteller), [events, storyteller]);
  const questions = useMemo(
    () => events.filter((e, i) => e.kind === "question" && e.text && events.findIndex((x) => x.text === e.text) === i),
    [events],
  );
  const current = [...cues].reverse().find((c) => time >= c.start && time <= c.end + 1.5);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };
  const jump = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, t);
    void v.play();
  };

  return (
    <div className="space-y-4">
      <video
        ref={videoRef}
        src={`/api/media/video/${storyId}`}
        controls
        preload="metadata"
        playsInline
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="aspect-video w-full rounded-3xl bg-black shadow"
      />

      {captions && (
        <div className="min-h-28 rounded-2xl bg-ink px-5 py-4 text-2xl leading-snug text-white" aria-live="off">
          {current ? (
            <>
              <span className="font-bold text-[#f5c86b]">{current.who}: </span>
              {current.text}
            </>
          ) : (
            <span className="text-white/60">Captions appear here while the video plays.</span>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-4 text-2xl font-bold text-white hover:bg-brand-dark"
        >
          {playing ? <IconPause /> : <IconPlay />} {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => jump((videoRef.current?.currentTime ?? 0) - 10)}
          className="flex items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card px-4 py-4 text-xl font-bold hover:border-brand"
        >
          <IconRepeat /> Back 10 seconds
        </button>
        <button
          type="button"
          onClick={() => setCaptions(!captions)}
          aria-pressed={captions}
          className="rounded-2xl border-2 border-line bg-card px-4 py-4 text-xl font-bold hover:border-brand"
        >
          Captions: {captions ? "On" : "Off"}
        </button>
      </div>

      {questions.length > 0 && (
        <section className="space-y-3 pt-4">
          <h2 className="text-3xl font-bold">Questions in this story</h2>
          <p className="text-xl text-ink-soft">Press a question to watch from there.</p>
          <ol className="space-y-2">
            {questions.map((q) => (
              <li key={`${q.t}-${q.text}`}>
                <button
                  type="button"
                  onClick={() => jump(q.t)}
                  className="flex w-full items-start gap-4 rounded-2xl border-2 border-line bg-card p-4 text-left text-xl hover:border-brand"
                >
                  <span className="shrink-0 rounded-lg bg-brand-soft px-2 py-1 font-bold text-brand">{formatDuration(q.t)}</span>
                  <span>{q.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {events.length > 0 && (
        <details className="rounded-2xl border-2 border-line bg-card p-5 text-xl">
          <summary className="cursor-pointer font-bold">Read the whole conversation</summary>
          <div className="mt-4 space-y-4">
            {events
              .filter((e) => e.text)
              .map((e, i) => (
                <p key={i}>
                  <span className="font-bold">{e.kind === "question" ? "Interviewer" : storyteller}: </span>
                  {e.text}
                </p>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
