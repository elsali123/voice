"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { IconBack, IconCheck, IconMic, IconNext, IconPause, IconPlay, IconRepeat, IconSpeaker } from "./icons";
import { InterviewSession, type SessionView } from "@/lib/client/interview-session";
import { useMicLevel } from "@/lib/client/mic-level";
import { speechRecognitionAvailable } from "@/lib/client/recognizer";
import { previewVoice } from "@/lib/client/voice-player";
import { formatDuration } from "@/lib/format";
import { TOPICS } from "@/lib/topics";
import type { UserSettings } from "@/lib/types";
import { pauseWaitMs } from "@/lib/voices";

type Step = "setup" | "topic" | "interview";
type CameraProblem = "permission" | "missing" | "other";
type Readiness = { state: "loading" } | { state: "ready"; note: string | null } | { state: "limited"; note: string };

const noSubscribe = () => () => {};

/** The recording studio: sound and camera check → choose a topic → recorded interview. */
export default function Studio({ firstName, settings }: { firstName: string; settings: UserSettings }) {
  const [step, setStep] = useState<Step>("setup");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraProblem, setCameraProblem] = useState<CameraProblem | null>(null);
  const [readiness, setReadiness] = useState<Readiness>({ state: "loading" });
  const [topic, setTopic] = useState<string | null>(null);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [view, setView] = useState<SessionView | null>(null);

  const [cameraAttempt, setCameraAttempt] = useState(0);
  const openCamera = useCallback(() => setCameraAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      .then(
        (s) => {
          if (cancelled) return s.getTracks().forEach((t) => t.stop());
          setCameraProblem(null);
          setStream(s);
        },
        (err: DOMException) => {
          if (cancelled) return;
          setCameraProblem(err.name === "NotAllowedError" ? "permission" : err.name === "NotFoundError" ? "missing" : "other");
        },
      );
    return () => {
      cancelled = true;
    };
  }, [cameraAttempt]);

  // Turn the camera off when leaving the page (or when a new stream replaces this one).
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);

  // Load the AI model and the voice while the person does the sound check.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/warmup", { method: "POST" })
      .then((r) => r.json())
      .then((d: { brain: boolean; brainError: string | null; voice: boolean }) => {
        if (cancelled) return;
        const voiceNote = d.voice ? null : "The natural voice couldn't load, so your computer's own voice will be used.";
        if (d.brain) setReadiness({ state: "ready", note: voiceNote });
        else
          setReadiness({
            state: "limited",
            note: `${d.brainError ?? "The AI interviewer isn't available."} Until then, your interviewer will use a list of good questions.`,
          });
      })
      .catch(() => !cancelled && setReadiness({ state: "limited", note: "Your interviewer will use a list of good questions." }));
    return () => {
      cancelled = true;
    };
  }, []);

  // Leaving the page mid-interview saves what was recorded so far.
  useEffect(() => () => session?.destroy(), [session]);

  const recording = !!view && ["starting", "thinking", "speaking", "listening", "saving"].includes(view.phase);
  useEffect(() => {
    if (!recording) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    const save = () => session?.saveOnExit();
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pagehide", save);
    };
  }, [recording, session]);

  const ended = view?.phase === "done" || view?.phase === "error";
  useEffect(() => {
    if (ended) stream?.getTracks().forEach((t) => t.stop());
  }, [ended, stream]);

  const begin = () => {
    if (!stream || !topic) return;
    const s = new InterviewSession({
      stream,
      topic,
      voice: settings.voice,
      speed: settings.speed,
      silenceMs: pauseWaitMs(settings.pauseWait),
      onUpdate: setView,
    });
    setSession(s);
    setStep("interview");
    void s.start();
  };

  if (step === "setup") {
    return (
      <SetupStep
        firstName={firstName}
        settings={settings}
        stream={stream}
        cameraProblem={cameraProblem}
        onRetryCamera={openCamera}
        readiness={readiness}
        onNext={() => setStep("topic")}
      />
    );
  }

  if (step === "topic") {
    return (
      <div className="space-y-6">
        <StepTitle step={2} title="What would you like to talk about today?" subtitle="Pick one. You can record about other things another day." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTopic(t.id)}
              aria-pressed={topic === t.id}
              className={`flex flex-col items-start gap-1 rounded-3xl border-4 p-5 text-left shadow-sm transition ${
                topic === t.id ? "border-brand bg-brand-soft" : "border-line bg-card hover:border-brand"
              }`}
            >
              <span className="text-5xl" aria-hidden="true">
                {t.emoji}
              </span>
              <span className="text-2xl font-bold">{t.label}</span>
              <span className="text-lg text-ink-soft">{t.hint}</span>
              {topic === t.id && (
                <span className="mt-1 flex items-center gap-1 font-bold text-brand">
                  <IconCheck className="size-6" /> Chosen
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="rounded-3xl border-2 border-line bg-card p-5 text-xl">
          <p className="font-bold">How it works</p>
          <p className="mt-1">
            Your interviewer will greet you and ask a question. Just talk naturally. When you finish an answer, pause for
            a moment, or press <strong>&ldquo;I&rsquo;m done answering&rdquo;</strong>, and the interviewer will go on.
            When you&rsquo;ve had enough, press <strong>&ldquo;Finish &amp; save&rdquo;</strong>.
          </p>
        </div>
        <div className="flex flex-col-reverse gap-4 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={() => setStep("setup")}
            className="flex items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card px-6 py-4 text-2xl font-bold hover:border-brand"
          >
            <IconBack /> Back
          </button>
          <button
            type="button"
            onClick={begin}
            disabled={!topic || readiness.state === "loading"}
            className="flex items-center justify-center gap-3 rounded-2xl bg-rec px-8 py-5 text-2xl font-bold text-white shadow hover:bg-rec-dark disabled:opacity-40"
          >
            {readiness.state === "loading" ? (
              "Getting your interviewer ready…"
            ) : (
              <>
                <span className="size-5 rounded-full bg-white" aria-hidden="true" /> Start recording
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return <InterviewStage view={view} stream={stream} session={session} />;
}

// ---------- step 1: sound and camera check ----------

function SetupStep({
  firstName,
  settings,
  stream,
  cameraProblem,
  onRetryCamera,
  readiness,
  onNext,
}: {
  firstName: string;
  settings: UserSettings;
  stream: MediaStream | null;
  cameraProblem: CameraProblem | null;
  onRetryCamera: () => void;
  readiness: Readiness;
  onNext: () => void;
}) {
  const { level, peak } = useMicLevel(stream);
  const [sound, setSound] = useState<"idle" | "playing" | "asked" | "yes" | "no">("idle");
  const captionsSupported = useSyncExternalStore(noSubscribe, speechRecognitionAvailable, () => true);

  const testSound = async () => {
    setSound("playing");
    await previewVoice(`Hello ${firstName}! Can you hear me clearly?`, settings.voice, settings.speed);
    setSound("asked");
  };

  return (
    <div className="space-y-6">
      <StepTitle step={1} title="Let's get ready" subtitle="A quick check that we can see you and hear you." />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div>
          {cameraProblem ? (
            <div className="grid aspect-video place-items-center rounded-3xl border-2 border-warn-line bg-warn-soft p-6 text-center text-xl">
              <div className="space-y-3">
                <p className="text-2xl font-bold">
                  {cameraProblem === "missing" ? "We couldn't find a camera." : "We need permission to use your camera and microphone."}
                </p>
                <p>
                  {cameraProblem === "missing"
                    ? "Please connect a webcam, then try again."
                    : "Look for a camera symbol at the top of the browser window, choose “Allow”, then press Try again."}
                </p>
                <button type="button" onClick={onRetryCamera} className="rounded-2xl bg-brand px-6 py-3 font-bold text-white">
                  Try again
                </button>
              </div>
            </div>
          ) : (
            <CameraPreview stream={stream} />
          )}
        </div>

        <ol className="space-y-4">
          <CheckItem done={!!stream} title="Can you see yourself?">
            Sit facing the screen, with light on your face.
          </CheckItem>
          <CheckItem done={peak > 0.3} title="Say hello out loud">
            <LevelMeter level={level} />
            <span className="mt-1 block">{peak > 0.3 ? "We can hear you!" : "The bars move when we hear you."}</span>
          </CheckItem>
          <CheckItem done={sound === "yes"} title="Can you hear the interviewer?">
            {sound === "asked" || sound === "no" ? (
              <span className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => setSound("yes")} className="rounded-xl bg-ok px-4 py-2 font-bold text-white">
                  Yes, I can hear it
                </button>
                <button type="button" onClick={() => setSound("no")} className="rounded-xl border-2 border-line bg-card px-4 py-2 font-bold">
                  No
                </button>
                <button type="button" onClick={testSound} className="rounded-xl border-2 border-line bg-card px-4 py-2 font-bold">
                  Play again
                </button>
              </span>
            ) : sound === "yes" ? (
              "Wonderful."
            ) : (
              <button
                type="button"
                onClick={testSound}
                disabled={sound === "playing"}
                className="mt-2 flex items-center gap-2 rounded-xl bg-brand px-4 py-2 font-bold text-white disabled:opacity-60"
              >
                <IconSpeaker className="size-6" /> {sound === "playing" ? "Playing… (the first time takes a moment)" : "Play a test sound"}
              </button>
            )}
            {sound === "no" && (
              <span className="mt-2 block">Turn up your computer&rsquo;s volume, or check that your speakers or headphones are plugged in.</span>
            )}
          </CheckItem>
          <CheckItem done={readiness.state !== "loading"} title="Your interviewer">
            {readiness.state === "loading"
              ? "Getting ready… (the first time can take up to a minute)"
              : readiness.note ?? "Ready when you are."}
          </CheckItem>
        </ol>
      </div>

      {!captionsSupported && (
        <Notice>
          For the best experience, please use <strong>Google Chrome</strong>. In this browser the interviewer can&rsquo;t
          follow what you say, but you can still record.
        </Notice>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={!stream}
          className="flex items-center justify-center gap-2 rounded-2xl bg-brand px-8 py-5 text-2xl font-bold text-white hover:bg-brand-dark disabled:opacity-40"
        >
          Next: choose a topic <IconNext />
        </button>
      </div>
    </div>
  );
}

// ---------- step 3: the interview ----------

function InterviewStage({ view, stream, session }: { view: SessionView | null; stream: MediaStream | null; session: InterviewSession | null }) {
  if (!view || !session) return <BigMessage title="Getting ready…" />;

  if (view.phase === "saving") {
    return <BigMessage title="Saving your story…" text="This only takes a moment. Please keep this window open." spinner />;
  }
  if (view.phase === "done") {
    return (
      <div className="mx-auto max-w-2xl space-y-6 rounded-3xl border-2 border-line bg-card p-8 text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-full bg-ok text-white">
          <IconCheck className="size-12" />
        </span>
        <h1 className="text-4xl font-bold">Your story is saved!</h1>
        <p className="text-2xl">Thank you for sharing it. We&rsquo;re writing a title and a short summary for it now.</p>
        {view.error && <Notice>{view.error}</Notice>}
        <div className="flex flex-col gap-3">
          <Link href={`/stories/${view.storyId}`} className="flex items-center justify-center gap-2 rounded-2xl bg-brand px-8 py-5 text-2xl font-bold text-white hover:bg-brand-dark">
            <IconPlay /> Watch my story
          </Link>
          {/* A full page load starts a fresh studio with the camera on again. */}
          <a href="/record" className="rounded-2xl border-2 border-line bg-card px-8 py-4 text-2xl font-bold hover:border-brand">
            Record another story
          </a>
          <Link href="/" className="rounded-2xl border-2 border-line bg-card px-8 py-4 text-2xl font-bold hover:border-brand">
            Go home
          </Link>
        </div>
      </div>
    );
  }
  if (view.phase === "error") {
    return (
      <div className="mx-auto max-w-2xl space-y-6 rounded-3xl border-2 border-rec bg-card p-8 text-center">
        <h1 className="text-4xl font-bold">Something went wrong</h1>
        <p className="text-2xl">{view.error}</p>
        <div className="flex flex-col gap-3">
          <a href="/record" className="rounded-2xl bg-brand px-8 py-5 text-2xl font-bold text-white">
            Try again
          </a>
          <Link href="/" className="rounded-2xl border-2 border-line bg-card px-8 py-4 text-2xl font-bold">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  const listening = view.phase === "listening" && !view.paused;
  const status = view.paused
    ? "Paused"
    : { starting: "Getting ready…", thinking: "Thinking…", speaking: "Talking…", listening: "Listening to you…" }[view.phase as "starting" | "thinking" | "speaking" | "listening"];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-3 rounded-full bg-card px-5 py-2 text-xl font-bold shadow-sm" role="status">
          <span className={`size-4 rounded-full ${view.paused ? "bg-ink-soft" : "animate-pulse bg-rec"}`} aria-hidden="true" />
          {view.paused ? "Paused" : "Recording"} {formatDuration(view.elapsedSec)}
        </p>
        <button
          type="button"
          onClick={() => session.finish()}
          disabled={view.finishing}
          className="rounded-2xl border-2 border-ink bg-card px-6 py-3 text-xl font-bold hover:bg-ink hover:text-white disabled:opacity-60"
        >
          {view.finishing ? "Saying goodbye…" : "Finish & save my story"}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="relative">
          <CameraPreview stream={stream} />
          {listening && (
            <div className="absolute bottom-3 left-3 rounded-xl bg-black/60 px-3 py-2">
              <LevelMeter level={view.level} dark />
            </div>
          )}
        </div>

        <section aria-label="Your interviewer" className="flex flex-col rounded-3xl border-2 border-line bg-card p-6">
          <div className="flex items-center gap-4">
            <span
              className={`grid size-16 shrink-0 place-items-center rounded-full bg-brand text-white ${
                view.phase === "speaking" && !view.paused ? "animate-pulse ring-8 ring-brand/25" : ""
              }`}
              aria-hidden="true"
            >
              <IconMic className="size-8" />
            </span>
            <div>
              <p className="text-lg font-bold text-ink-soft">Your interviewer</p>
              <p className="text-xl font-bold">{status}</p>
            </div>
          </div>
          <p className="mt-5 text-3xl leading-snug font-bold" aria-live="polite">
            {view.question || "Getting ready…"}
          </p>
          {view.phase === "listening" && (
            <div className="mt-auto pt-6">
              <p className="text-lg font-bold text-ink-soft">What we&rsquo;re hearing</p>
              <p className="min-h-[3lh] text-xl text-ink-soft">
                {view.heard ? lastWords(view.heard, 45) : "Take your time. Start talking whenever you're ready."}
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => session.finishAnswer()}
          disabled={!listening}
          className="flex w-full items-center justify-center gap-3 rounded-3xl bg-ok py-7 text-3xl font-bold text-white shadow hover:bg-ok-dark disabled:bg-ink-soft/40 disabled:text-ink"
        >
          {listening ? (
            <>
              <IconCheck className="size-9" /> I&rsquo;m done answering
            </>
          ) : view.phase === "speaking" ? (
            "The interviewer is talking…"
          ) : view.paused ? (
            "Paused"
          ) : (
            "The interviewer is thinking…"
          )}
        </button>
        <div className="grid gap-3 sm:grid-cols-3">
          <ControlButton onClick={() => void session.repeatQuestion()} disabled={!listening} icon={<IconRepeat />}>
            Repeat the question
          </ControlButton>
          <ControlButton onClick={() => session.askSomethingElse()} disabled={!listening} icon={<IconNext />}>
            Ask me something else
          </ControlButton>
          <ControlButton
            onClick={() => (view.paused ? session.resume() : session.pause())}
            disabled={view.phase === "starting"}
            icon={view.paused ? <IconPlay /> : <IconPause />}
          >
            {view.paused ? "Continue" : "Pause"}
          </ControlButton>
        </div>
      </div>

      {view.captionsNote && <Notice>{view.captionsNote}</Notice>}

      {view.paused && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="paused-title" className="w-full max-w-lg space-y-5 rounded-3xl bg-card p-8 text-center">
            <h2 id="paused-title" className="text-4xl font-bold">
              Recording paused
            </h2>
            <p className="text-2xl">Take all the time you need.</p>
            <button
              type="button"
              autoFocus
              onClick={() => session.resume()}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-ok py-5 text-2xl font-bold text-white hover:bg-ok-dark"
            >
              <IconPlay /> Continue recording
            </button>
            <button type="button" onClick={() => session.finish()} className="w-full rounded-2xl border-2 border-line py-4 text-xl font-bold hover:border-brand">
              Finish &amp; save my story
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- small pieces ----------

function lastWords(text: string, n: number): string {
  const words = text.split(/\s+/);
  return words.length > n ? `…${words.slice(-n).join(" ")}` : text;
}

function StepTitle({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  return (
    <div>
      <p className="text-xl font-bold text-brand">Step {step} of 3</p>
      <h1 className="text-4xl font-bold">{title}</h1>
      <p className="mt-1 text-2xl text-ink-soft">{subtitle}</p>
    </div>
  );
}

function CameraPreview({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      aria-label="Your camera"
      className="aspect-video w-full -scale-x-100 rounded-3xl bg-ink object-cover shadow"
    />
  );
}

function LevelMeter({ level, dark = false }: { level: number; dark?: boolean }) {
  const bars = 10;
  return (
    <span className="flex h-8 items-end gap-1" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={`w-3 rounded-sm transition-all ${level * bars > i ? "bg-ok" : dark ? "bg-white/30" : "bg-line"}`}
          style={{ height: `${30 + (i / bars) * 70}%` }}
        />
      ))}
    </span>
  );
}

function CheckItem({ done, title, children }: { done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className={`flex gap-4 rounded-3xl border-2 p-4 ${done ? "border-ok bg-ok-soft" : "border-line bg-card"}`}>
      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${done ? "bg-ok text-white" : "border-2 border-line"}`} aria-hidden="true">
        {done && <IconCheck className="size-6" />}
      </span>
      <div className="text-lg">
        <p className="text-xl font-bold">
          {title}
          <span className="sr-only">{done ? " (done)" : ""}</span>
        </p>
        <div className="text-ink-soft">{children}</div>
      </div>
    </li>
  );
}

function ControlButton({ onClick, disabled, icon, children }: { onClick: () => void; disabled?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 rounded-2xl border-2 border-line bg-card px-4 py-4 text-xl font-bold hover:border-brand disabled:opacity-40"
    >
      {icon}
      {children}
    </button>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border-2 border-warn-line bg-warn-soft p-4 text-xl">{children}</div>;
}

function BigMessage({ title, text, spinner }: { title: string; text?: string; spinner?: boolean }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-3xl border-2 border-line bg-card p-10 text-center" role="status">
      {spinner && <span className="mx-auto block size-14 animate-spin rounded-full border-8 border-brand-soft border-t-brand" aria-hidden="true" />}
      <h1 className="text-4xl font-bold">{title}</h1>
      {text && <p className="text-2xl">{text}</p>}
    </div>
  );
}
