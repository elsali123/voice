"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Avatar from "./Avatar";
import CameraSnap from "./CameraSnap";
import { IconSpeaker } from "./icons";
import { previewVoice } from "@/lib/client/voice-player";
import { AGE_GROUPS, BACKGROUNDS } from "@/lib/roles";
import type { Role, User, UserSettings } from "@/lib/types";
import { PAUSE_WAITS, SPEEDS, VOICES } from "@/lib/voices";

type FieldKey = "name" | "birthYear" | "hometown" | "work" | "interests" | "goals" | "about" | "ageGroup" | "background";

const FIELDS: Record<Role, { key: FieldKey; label: string }[]> = {
  storyteller: [
    { key: "name", label: "Your name" },
    { key: "birthYear", label: "Year you were born" },
    { key: "hometown", label: "Where you grew up" },
    { key: "work", label: "Work you did" },
    { key: "interests", label: "Things you enjoy" },
  ],
  listener: [
    { key: "name", label: "Your name" },
    { key: "interests", label: "What you're interested in" },
    { key: "goals", label: "What you'd love to learn from an older person" },
  ],
  coordinator: [{ key: "name", label: "Your name" }],
};

const ABOUT_LABEL: Partial<Record<Role, { label: string; placeholder: string }>> = {
  storyteller: { label: "Anything else your interviewer should know?", placeholder: "For example: I have four grandchildren and I served in the Navy." },
  listener: { label: "Is there someone you'd like to be paired with?", placeholder: "For example: my grandma, Margaret Hill" },
};

/** Edit profile, picture and interviewer settings; sign out. */
export default function MeForm({ user, brainLabel }: { user: User; brainLabel: string }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<FieldKey, string>>({
    name: user.name,
    birthYear: user.birthYear ? String(user.birthYear) : "",
    hometown: user.hometown,
    work: user.work,
    interests: user.interests,
    goals: user.goals,
    about: user.about,
    ageGroup: user.ageGroup,
    background: user.background,
  });
  const [settings, setSettings] = useState<UserSettings>(user.settings);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [playing, setPlaying] = useState<string | null>(null);

  const change = () => setStatus("idle");

  const save = async () => {
    setStatus("saving");
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...values, ...(user.role === "storyteller" ? { settings } : {}), ...(newPhoto ? { photo: newPhoto } : {}) }),
    });
    if (!res.ok) return setStatus("error");
    setStatus("saved");
    setTakingPhoto(false);
    setNewPhoto(null);
    router.refresh();
  };

  const hear = async (voice: string) => {
    setPlaying(voice);
    await previewVoice("Hello! I'm looking forward to hearing your stories.", voice, settings.speed);
    setPlaying(null);
  };

  const signOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/");
    router.refresh();
  };

  return (
    <form
      className="space-y-10"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <section className="space-y-5 rounded-3xl border-2 border-line bg-card p-6">
        <h2 className="text-3xl font-bold">About you</h2>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          {takingPhoto ? (
            <CameraSnap
              onPhoto={(p) => {
                setNewPhoto(p);
                change();
              }}
            />
          ) : (
            <>
              <Avatar user={user} size={120} />
              <button
                type="button"
                onClick={() => setTakingPhoto(true)}
                className="rounded-2xl border-2 border-line bg-card px-5 py-3 text-xl font-bold hover:border-brand"
              >
                {user.photoVersion ? "Take a new picture" : "Add a picture"}
              </button>
            </>
          )}
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {FIELDS[user.role].map((f) => (
            <label key={f.key} className="block space-y-1">
              <span className="text-xl font-bold">{f.label}</span>
              <input
                value={values[f.key]}
                inputMode={f.key === "birthYear" ? "numeric" : "text"}
                maxLength={f.key === "birthYear" ? 4 : 120}
                onChange={(e) => {
                  setValues({ ...values, [f.key]: f.key === "birthYear" ? e.target.value.replace(/\D/g, "") : e.target.value });
                  change();
                }}
                className="w-full rounded-xl border-2 border-line px-4 py-3 text-xl focus:border-brand focus:outline-none"
              />
            </label>
          ))}
        </div>
        {user.role === "listener" && (
          <>
            <Choice
              legend="How old are you?"
              options={AGE_GROUPS}
              value={values.ageGroup}
              onChange={(v) => {
                setValues({ ...values, ageGroup: v });
                change();
              }}
            />
            <Choice
              legend="Which describes you best?"
              options={BACKGROUNDS.map((b) => ({ value: b, label: b }))}
              value={values.background}
              onChange={(v) => {
                setValues({ ...values, background: v });
                change();
              }}
            />
          </>
        )}
        {ABOUT_LABEL[user.role] && (
          <label className="block space-y-1">
            <span className="text-xl font-bold">{ABOUT_LABEL[user.role]!.label}</span>
            <textarea
              value={values.about}
              rows={3}
              maxLength={1000}
              onChange={(e) => {
                setValues({ ...values, about: e.target.value });
                change();
              }}
              placeholder={ABOUT_LABEL[user.role]!.placeholder}
              className="w-full rounded-xl border-2 border-line px-4 py-3 text-xl focus:border-brand focus:outline-none"
            />
          </label>
        )}
      </section>

      {user.role === "storyteller" && (
        <section className="space-y-6 rounded-3xl border-2 border-line bg-card p-6">
          <div>
            <h2 className="text-3xl font-bold">Your interviewer</h2>
            <p className="text-lg text-ink-soft">Powered by {brainLabel}.</p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-xl font-bold">Voice</legend>
            <div className="grid gap-3 md:grid-cols-2">
              {VOICES.map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center justify-between gap-3 rounded-2xl border-2 p-3 ${
                    settings.voice === v.id ? "border-brand bg-brand-soft" : "border-line"
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={settings.voice === v.id}
                    onClick={() => {
                      setSettings({ ...settings, voice: v.id });
                      change();
                    }}
                    className="flex-1 text-left"
                  >
                    <span className="block text-xl font-bold">
                      {v.label} {settings.voice === v.id && "✓"}
                    </span>
                    <span className="text-lg text-ink-soft">{v.description}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void hear(v.id)}
                    disabled={playing !== null}
                    className="flex items-center gap-1 rounded-xl border-2 border-line bg-card px-3 py-2 text-lg font-bold hover:border-brand disabled:opacity-50"
                  >
                    <IconSpeaker className="size-6" /> {playing === v.id ? "Playing…" : "Listen"}
                  </button>
                </div>
              ))}
            </div>
          </fieldset>

          <Choice
            legend="Speaking speed"
            options={SPEEDS.map((s) => ({ value: String(s.value), label: s.label }))}
            value={String(settings.speed)}
            onChange={(v) => {
              setSettings({ ...settings, speed: Number(v) });
              change();
            }}
          />

          <Choice
            legend="When you pause, how long should the interviewer wait before speaking?"
            options={PAUSE_WAITS.map((p) => ({ value: p.value, label: p.label, hint: p.hint }))}
            value={settings.pauseWait}
            onChange={(v) => {
              setSettings({ ...settings, pauseWait: v as UserSettings["pauseWait"] });
              change();
            }}
          />
        </section>
      )}

      <div className="sticky bottom-32 z-10 flex flex-col gap-3 rounded-3xl border-2 border-line bg-card p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xl font-bold" role="status">
          {status === "saved" ? "Your changes are saved ✓" : status === "error" ? "Something went wrong. Please try again." : ""}
        </p>
        <button
          type="submit"
          disabled={status === "saving" || (takingPhoto && !newPhoto)}
          className="rounded-2xl bg-brand px-8 py-4 text-2xl font-bold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
      </div>

      <div className="text-center">
        <button type="button" onClick={signOut} className="rounded-2xl border-2 border-ink px-8 py-4 text-2xl font-bold hover:bg-ink hover:text-white">
          Sign out
        </button>
      </div>
    </form>
  );
}

function Choice({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { value: string; label: string; hint?: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xl font-bold">{legend}</legend>
      <div className={`grid gap-3 ${options.length > 3 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-2xl border-2 px-4 py-3 text-xl font-bold ${
              value === o.value ? "border-brand bg-brand text-white" : "border-line bg-card hover:border-brand"
            }`}
          >
            {o.label}
            {o.hint && <span className="block text-base font-normal">{o.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
