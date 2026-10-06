"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import CameraSnap from "./CameraSnap";
import PinPad from "./PinPad";
import { IconBack, IconNext } from "./icons";

type Field = "name" | "birthYear" | "hometown" | "work" | "interests";

interface TextStep {
  kind: "text";
  field: Field;
  question: string;
  help: string;
  placeholder: string;
  required?: boolean;
  numeric?: boolean;
}

const STEPS: (TextStep | { kind: "photo" } | { kind: "pin" })[] = [
  { kind: "text", field: "name", question: "What's your name?", help: "This is how others will see you.", placeholder: "For example: Margaret Hill", required: true },
  { kind: "photo" },
  { kind: "text", field: "birthYear", question: "What year were you born?", help: "Your interviewer uses this to ask about the right times in history.", placeholder: "For example: 1948", numeric: true },
  { kind: "text", field: "hometown", question: "Where did you grow up?", help: "A town, a city or a country, whatever you like.", placeholder: "For example: a farm near Toledo, Ohio" },
  { kind: "text", field: "work", question: "What kind of work did you do?", help: "Paid work, raising a family, volunteering: it all counts.", placeholder: "For example: school teacher for 30 years" },
  { kind: "text", field: "interests", question: "What do you enjoy?", help: "Hobbies, interests, things you love to talk about.", placeholder: "For example: gardening, baseball, baking pies" },
  { kind: "pin" },
];

/** "I'm new here": one question per screen, then a PIN. */
export default function JoinWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<Field, string>>({ name: "", birthYear: "", hometown: "", work: "", interests: "" });
  const [photo, setPhoto] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const first = values.name.trim().split(/\s+/)[0];

  const canContinue =
    current.kind === "pin" ? pin.length === 4 : current.kind === "text" && current.required ? values[current.field].trim().length > 0 : true;
  const isEmptyOptional = current.kind === "photo" ? !photo : current.kind === "text" && !current.required && !values[current.field].trim();

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...values, photo, pin }),
    });
    if (res.ok) {
      router.push("/record");
      router.refresh();
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(body.error ?? "Something went wrong. Please try again.");
    setBusy(false);
  };

  const next = () => {
    if (!canContinue) return;
    if (isLast) void submit();
    else setStep(step + 1);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <p className="text-xl font-bold text-ink-soft">
          Step {step + 1} of {STEPS.length}
        </p>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
        className="space-y-6"
      >
        {current.kind === "text" && (
          <>
            <label htmlFor={current.field} className="block space-y-2">
              <span className="block text-4xl font-bold">{current.question}</span>
              <span className="block text-xl text-ink-soft">{current.help}</span>
            </label>
            <input
              id={current.field}
              key={current.field}
              autoFocus
              inputMode={current.numeric ? "numeric" : "text"}
              maxLength={current.numeric ? 4 : 120}
              value={values[current.field]}
              onChange={(e) =>
                setValues({ ...values, [current.field]: current.numeric ? e.target.value.replace(/\D/g, "") : e.target.value })
              }
              placeholder={current.placeholder}
              className="w-full rounded-2xl border-4 border-line bg-card px-5 py-4 text-3xl placeholder:text-ink-soft/60 focus:border-brand focus:outline-none"
            />
          </>
        )}

        {current.kind === "photo" && (
          <>
            <div className="space-y-2">
              <h1 className="text-4xl font-bold">Nice to meet you{first ? `, ${first}` : ""}! Let&apos;s take your picture.</h1>
              <p className="text-xl text-ink-soft">Look at the screen and smile. You can skip this and add a picture later.</p>
            </div>
            <CameraSnap onPhoto={setPhoto} />
          </>
        )}

        {current.kind === "pin" && (
          <>
            <div className="space-y-2">
              <h1 className="text-4xl font-bold">Choose a 4-digit PIN</h1>
              <p className="text-xl text-ink-soft">
                You&apos;ll use it to sign in. Pick something easy to remember, and write it down somewhere safe.
              </p>
            </div>
            <PinPad value={pin} onChange={setPin} disabled={busy} label="Your new PIN" />
          </>
        )}

        {error && (
          <p role="alert" className="rounded-2xl border-2 border-rec bg-rec/10 p-4 text-xl font-bold text-rec">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-4 sm:flex-row sm:justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card px-6 py-4 text-2xl font-bold hover:border-brand"
            >
              <IconBack /> Back
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={!canContinue || busy}
            className="flex items-center justify-center gap-2 rounded-2xl bg-brand px-8 py-4 text-2xl font-bold text-white hover:bg-brand-dark disabled:opacity-40"
          >
            {busy ? "Saving…" : isLast ? "Finish" : isEmptyOptional ? "Skip" : "Next"}
            {!busy && <IconNext />}
          </button>
        </div>
      </form>
    </div>
  );
}
