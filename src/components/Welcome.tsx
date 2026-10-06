"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import Avatar from "./Avatar";
import PinPad from "./PinPad";
import { IconBack } from "./icons";
import type { PublicUser } from "@/lib/types";

/** Signed-out home page: tap your picture, then enter your PIN. */
export default function Welcome({ people }: { people: PublicUser[] }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<PublicUser | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const enterPin = useCallback(
    async (next: string) => {
      setPin(next);
      setError(null);
      if (next.length < 4 || !chosen) return;
      setBusy(true);
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: chosen.id, pin: next }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Something went wrong. Please try again.");
      setPin("");
      setBusy(false);
    },
    [chosen, router],
  );

  if (chosen) {
    return (
      <div className="mx-auto max-w-xl space-y-6 text-center">
        <button
          type="button"
          onClick={() => {
            setChosen(null);
            setPin("");
            setError(null);
          }}
          className="flex items-center gap-2 rounded-2xl border-2 border-line bg-card px-5 py-3 text-xl font-bold hover:border-brand"
        >
          <IconBack /> Back
        </button>
        <div className="flex flex-col items-center gap-3">
          <Avatar user={chosen} size={120} />
          <h1 className="text-4xl font-bold">Hello, {chosen.name.split(/\s+/)[0]}!</h1>
          <p className="text-2xl">Please enter your 4-digit PIN.</p>
        </div>
        {error && (
          <p role="alert" className="rounded-2xl border-2 border-rec bg-rec/10 p-4 text-xl font-bold text-rec">
            {error}
          </p>
        )}
        <PinPad value={pin} onChange={enterPin} disabled={busy} label="Your PIN" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4 rounded-3xl bg-brand p-8 text-white sm:p-12">
        <h1 className="text-4xl leading-tight font-bold sm:text-5xl">Your life story is worth sharing.</h1>
        <p className="max-w-3xl text-2xl">
          A friendly interviewer asks you questions, and you simply talk. We record a video of your answers so your
          family and young people can hear your stories for years to come.
        </p>
      </section>

      <section className="space-y-5">
        <h2 className="text-3xl font-bold">{people.length ? "Who is here today?" : "Welcome!"}</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setChosen(p)}
                className="flex w-full items-center gap-4 rounded-3xl border-2 border-line bg-card p-5 text-left text-2xl font-bold shadow-sm hover:border-brand"
              >
                <Avatar user={p} size={72} />
                {p.name}
              </button>
            </li>
          ))}
          <li>
            <Link
              href="/join"
              className="flex h-full min-h-28 items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-brand bg-brand-soft p-5 text-2xl font-bold text-brand hover:bg-brand hover:text-white"
            >
              <span aria-hidden="true" className="text-4xl leading-none">
                +
              </span>
              I&apos;m new here
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
