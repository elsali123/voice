"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import CameraSnap from "./CameraSnap";
import PinPad from "./PinPad";
import { IconBack, IconCheck, IconNext } from "./icons";
import { AGE_GROUPS, BACKGROUNDS } from "@/lib/roles";
import type { Role } from "@/lib/types";

type Field = "name" | "birthYear" | "hometown" | "work" | "interests" | "goals" | "about" | "ageGroup" | "background" | "coordinatorCode";

type Step =
  | { kind: "role" }
  | { kind: "text"; field: Field; question: string; help: string; placeholder: string; required?: boolean; numeric?: boolean }
  | { kind: "choice"; field: Field; question: string; help: string; options: { value: string; label: string }[]; required?: boolean }
  | { kind: "photo" }
  | { kind: "pin" };

const NAME: Step = { kind: "text", field: "name", question: "What's your name?", help: "This is how others will see you.", placeholder: "For example: Margaret Hill", required: true };

const STEPS: Record<Role, Step[]> = {
  storyteller: [
    NAME,
    { kind: "photo" },
    { kind: "text", field: "birthYear", question: "What year were you born?", help: "Your interviewer uses this to ask about the right times in history.", placeholder: "For example: 1948", numeric: true },
    { kind: "text", field: "hometown", question: "Where did you grow up?", help: "A town, a city or a country, whatever you like.", placeholder: "For example: a farm near Toledo, Ohio" },
    { kind: "text", field: "work", question: "What kind of work did you do?", help: "Paid work, raising a family, volunteering: it all counts.", placeholder: "For example: school teacher for 30 years" },
    { kind: "text", field: "interests", question: "What do you enjoy?", help: "Hobbies, interests, things you love to talk about.", placeholder: "For example: gardening, baseball, baking pies" },
    { kind: "pin" },
  ],
  listener: [
    { ...NAME, placeholder: "For example: Jamie Rivera" },
    { kind: "photo" },
    {
      kind: "choice",
      field: "ageGroup",
      question: "How old are you?",
      help: "This helps your coordinator find a good match.",
      options: AGE_GROUPS,
      required: true,
    },
    {
      kind: "choice",
      field: "background",
      question: "Which describes you best?",
      help: "Choose one.",
      options: BACKGROUNDS.map((b) => ({ value: b, label: b })),
      required: true,
    },
    { kind: "text", field: "interests", question: "What are you interested in?", help: "Hobbies, school subjects, sports, music, anything.", placeholder: "For example: baseball, history, cooking" },
    {
      kind: "text",
      field: "goals",
      question: "What would you love to learn from an older person?",
      help: "We use this to pair you with a storyteller who lived it.",
      placeholder: "For example: what school was like 60 years ago",
    },
    {
      kind: "text",
      field: "about",
      question: "Is there someone you'd like to be paired with?",
      help: "Optional. Use their full name. For example, your grandmother, if she's sharing her stories here too.",
      placeholder: "For example: my grandma, Margaret Hill",
    },
    { kind: "pin" },
  ],
  coordinator: [
    NAME,
    {
      kind: "text",
      field: "coordinatorCode",
      question: "What's the coordinator code?",
      help: "Coordinators approve pairings between listeners and storytellers. The code is set by whoever runs this program.",
      placeholder: "Coordinator code",
      required: true,
    },
    { kind: "pin" },
  ],
};

const ROLE_OPTIONS: { role: Role; title: string; text: string; emoji: string }[] = [
  { role: "storyteller", title: "I want to share my life stories", text: "A friendly interviewer asks the questions. You just talk.", emoji: "🎙️" },
  { role: "listener", title: "I want to listen and learn", text: "For students, volunteers, grandchildren and anyone curious.", emoji: "🎧" },
];

const AFTER_JOIN: Record<Role, string> = { storyteller: "/record", listener: "/", coordinator: "/coordinator" };

/** "I'm new here": who are you, then one question per screen, then a PIN. */
export default function JoinWizard() {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<Field, string>>({
    name: "",
    birthYear: "",
    hometown: "",
    work: "",
    interests: "",
    goals: "",
    about: "",
    ageGroup: "",
    background: "",
    coordinatorCode: "",
  });
  const [photo, setPhoto] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const steps: Step[] = [{ kind: "role" }, ...(role ? STEPS[role] : [])];
  const current = steps[step];
  const isLast = role !== null && step === steps.length - 1;
  const first = values.name.trim().split(/\s+/)[0];

  const canContinue =
    current.kind === "role"
      ? role !== null
      : current.kind === "pin"
        ? pin.length === 4
        : current.kind === "text" || current.kind === "choice"
          ? !current.required || values[current.field].trim().length > 0
          : true;
  const isEmptyOptional =
    current.kind === "photo" ? !photo : (current.kind === "text" || current.kind === "choice") && !current.required && !values[current.field].trim();

  const submit = async () => {
    if (!role) return;
    setBusy(true);
    setError(null);
    // Only this role's answers: someone may have started as another role, then gone back.
    const roleSteps = STEPS[role];
    const answers = Object.fromEntries(roleSteps.flatMap((s) => (s.kind === "text" || s.kind === "choice" ? [[s.field, values[s.field]]] : [])));
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...answers, role, photo: roleSteps.some((s) => s.kind === "photo") ? photo : null, pin }),
    });
    if (res.ok) {
      router.push(AFTER_JOIN[role]);
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

  const choose = (field: Field, value: string) => setValues({ ...values, [field]: value });

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {role && (
        <div>
          <p className="text-xl font-bold text-ink-soft">
            Step {step + 1} of {steps.length}
          </p>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
        className="space-y-6"
      >
        {current.kind === "role" && (
          <>
            <h1 className="text-4xl font-bold">Welcome! Which describes you?</h1>
            <div className="grid gap-4">
              {ROLE_OPTIONS.map((o) => (
                <button
                  key={o.role}
                  type="button"
                  aria-pressed={role === o.role}
                  onClick={() => setRole(o.role)}
                  className={`flex items-center gap-5 rounded-3xl border-4 p-6 text-left ${role === o.role ? "border-brand bg-brand-soft" : "border-line bg-card hover:border-brand"}`}
                >
                  <span className="text-5xl" aria-hidden="true">
                    {o.emoji}
                  </span>
                  <span>
                    <span className="block text-2xl font-bold">{o.title}</span>
                    <span className="block text-xl text-ink-soft">{o.text}</span>
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRole("coordinator")}
              aria-pressed={role === "coordinator"}
              className={`text-xl underline ${role === "coordinator" ? "font-bold text-brand" : "text-ink-soft"}`}
            >
              {role === "coordinator" ? "✓ I'm a program coordinator" : "I'm a program coordinator"}
            </button>
          </>
        )}

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
              maxLength={current.numeric ? 4 : 200}
              value={values[current.field]}
              onChange={(e) => choose(current.field, current.numeric ? e.target.value.replace(/\D/g, "") : e.target.value)}
              placeholder={current.placeholder}
              className="w-full rounded-2xl border-4 border-line bg-card px-5 py-4 text-3xl placeholder:text-ink-soft/60 focus:border-brand focus:outline-none"
            />
          </>
        )}

        {current.kind === "choice" && (
          <fieldset className="space-y-4">
            <legend className="space-y-2">
              <span className="block text-4xl font-bold">{current.question}</span>
              <span className="block text-xl text-ink-soft">{current.help}</span>
            </legend>
            <div className="grid gap-3">
              {current.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={values[current.field] === o.value}
                  onClick={() => choose(current.field, o.value)}
                  className={`flex items-center justify-between rounded-2xl border-4 px-5 py-4 text-left text-2xl font-bold ${
                    values[current.field] === o.value ? "border-brand bg-brand-soft" : "border-line bg-card hover:border-brand"
                  }`}
                >
                  {o.label}
                  {values[current.field] === o.value && <IconCheck className="size-7 text-brand" />}
                </button>
              ))}
            </div>
          </fieldset>
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
