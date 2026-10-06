"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Visibility } from "@/lib/types";

/** Rename, change who can watch, or delete a story (only shown to the storyteller). */
export default function StoryOwnerControls({ storyId, title, visibility }: { storyId: string; title: string; visibility: Visibility }) {
  const router = useRouter();
  const [name, setName] = useState(title);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = async (body: Record<string, string>) => {
    await fetch(`/api/stories/${storyId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    router.refresh();
  };

  return (
    <section className="space-y-5 rounded-3xl border-2 border-line bg-card p-5">
      <h2 className="text-2xl font-bold">Your story settings</h2>

      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await patch({ title: name });
          setSaved(true);
        }}
      >
        <label htmlFor="story-title" className="block text-xl font-bold">
          Title
        </label>
        <input
          id="story-title"
          value={name}
          maxLength={90}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          className="w-full rounded-xl border-2 border-line px-4 py-3 text-xl focus:border-brand focus:outline-none"
        />
        <button type="submit" className="rounded-xl bg-brand px-5 py-2 text-xl font-bold text-white">
          {saved ? "Saved ✓" : "Save title"}
        </button>
      </form>

      <fieldset className="space-y-2">
        <legend className="text-xl font-bold">Who can watch?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["everyone", "Everyone"],
              ["private", "Only me"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={visibility === value}
              onClick={() => void patch({ visibility: value })}
              className={`rounded-xl border-2 px-4 py-3 text-xl font-bold ${
                visibility === value ? "border-brand bg-brand text-white" : "border-line bg-card hover:border-brand"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      {confirmDelete ? (
        <div className="space-y-3 rounded-2xl border-2 border-rec bg-rec/10 p-4" role="alert">
          <p className="text-xl font-bold">Delete this story forever? This can&rsquo;t be undone.</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                await fetch(`/api/stories/${storyId}`, { method: "DELETE" });
                router.push("/");
                router.refresh();
              }}
              className="rounded-xl bg-rec px-4 py-3 text-xl font-bold text-white"
            >
              Yes, delete it
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-xl border-2 border-line bg-card px-4 py-3 text-xl font-bold">
              No, keep it
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)} className="text-xl font-bold text-rec underline">
          Delete this story
        </button>
      )}
    </section>
  );
}
