import type { HistoryItem, InterviewAction, StoryEvent } from "../types";
import { levelOf } from "./mic-level";
import { Recognizer } from "./recognizer";
import { VoicePlayer } from "./voice-player";

/**
 * Runs one recorded interview in the browser:
 *   interviewer speaks → storyteller answers → (pause detected or "I'm done") → interviewer replies …
 * The webcam video, the storyteller's microphone and the interviewer's voice are mixed into one
 * recording, which is uploaded every few seconds while the interview runs.
 */

export type Phase = "starting" | "thinking" | "speaking" | "listening" | "saving" | "done" | "error";

export interface SessionView {
  phase: Phase;
  paused: boolean;
  /** "Finish" was pressed; the interviewer is wrapping up. */
  finishing: boolean;
  /** What the interviewer said last. */
  question: string;
  /** Live transcript of the current answer. */
  heard: string;
  elapsedSec: number;
  /** Microphone level 0–1. */
  level: number;
  /** Shown when live captions don't work (other browser, no internet). */
  captionsNote: string | null;
  storyId: string | null;
  error: string | null;
}

export interface SessionOptions {
  stream: MediaStream;
  topic: string;
  voice: string;
  speed: number;
  /** Silence after an answer before the interviewer replies. */
  silenceMs: number;
  onUpdate: (view: SessionView) => void;
}

const JSON_HEADERS = { "content-type": "application/json" };
const CHECK_IN_EVERY_SEC = 15 * 60;
/** Mic level that counts as someone talking. */
const TALKING_LEVEL = 0.25;
/** Mic volume in the recording while the interviewer talks: low enough to keep speaker echo down, high enough to keep a storyteller who starts answering early. */
const MIC_WHILE_INTERVIEWER_TALKS = 0.4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** While paused no video is uploaded, so the server is told every so often that the recording is still in use. */
const PAUSED_KEEPALIVE_MS = 30_000;

/** Reads the interviewer's streamed reply (one JSON line per sentence). */
async function* readSentences(body: ReadableStream<Uint8Array> | null, fallback?: string): AsyncGenerator<string> {
  if (!body) {
    if (fallback) yield fallback;
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      for (let nl = pending.indexOf("\n"); nl >= 0; nl = pending.indexOf("\n")) {
        const line = pending.slice(0, nl).trim();
        pending = pending.slice(nl + 1);
        if (line) yield (JSON.parse(line) as { text: string }).text;
      }
    }
  } finally {
    // Stopping early (e.g. "Finish" pressed) tells the server to stop generating.
    await reader.cancel().catch(() => {});
  }
}

export class InterviewSession {
  private view: SessionView = {
    phase: "starting",
    paused: false,
    finishing: false,
    question: "",
    heard: "",
    elapsedSec: 0,
    level: 0,
    captionsNote: null,
    storyId: null,
    error: null,
  };
  private ctx: AudioContext | null = null;
  private micGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private levelData: Float32Array<ArrayBuffer> | null = null;
  private recorder: MediaRecorder | null = null;
  private recorderStopped: Promise<void> = Promise.resolve();
  private player: VoicePlayer | null = null;
  private recognizer: Recognizer;
  private captionsWorking: boolean;
  private history: HistoryItem[] = [];
  private events: StoryEvent[] = [];
  private uploads: Promise<void> = Promise.resolve();
  private uploadFailed = false;
  private elapsedMs = 0;
  private runningSince: number | null = null;
  private answerStart = 0;
  private lastLoudAt = 0;
  private loudMs = 0;
  private silenceTimer: ReturnType<typeof setInterval> | undefined;
  private tickTimer: ReturnType<typeof setInterval> | undefined;
  private keepAliveTimer: ReturnType<typeof setInterval> | undefined;
  private pauseWaiters: (() => void)[] = [];
  private lastCheckInSec = 0;
  private wrapRequested = false;
  private saving = false;
  private destroyed = false;
  private thumbnail: string | null = null;

  constructor(private opts: SessionOptions) {
    this.recognizer = new Recognizer(this.clock);
    this.captionsWorking = this.recognizer.supported;
    this.recognizer.onChange = () => this.set({ heard: this.recognizer.text });
    this.recognizer.onFatal = (message) => {
      this.captionsWorking = false;
      this.set({ captionsNote: message });
    };
    if (!this.recognizer.supported) {
      this.view.captionsNote =
        "This browser can't show live captions, so please use Google Chrome for the best experience. You can still record; tap “I’m done answering” after each answer.";
    }
  }

  /** Seconds recorded so far, not counting pauses. Matches the video's timeline. */
  clock = (): number => (this.elapsedMs + (this.runningSince !== null ? performance.now() - this.runningSince : 0)) / 1000;

  private set(patch: Partial<SessionView>) {
    this.view = { ...this.view, ...patch };
    this.opts.onUpdate(this.view);
  }

  async start() {
    this.opts.onUpdate(this.view);
    try {
      const ctx = new AudioContext();
      this.ctx = ctx;
      await ctx.resume();
      const mic = ctx.createMediaStreamSource(this.opts.stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.levelData = new Float32Array(this.analyser.fftSize);
      mic.connect(this.analyser);
      this.micGain = ctx.createGain();
      mic.connect(this.micGain);
      const recordingAudio = ctx.createMediaStreamDestination();
      this.micGain.connect(recordingAudio);
      // The interviewer's voice goes to the speakers and into the recording.
      this.player = new VoicePlayer(ctx, [ctx.destination, recordingAudio], this.opts.voice, this.opts.speed);

      const res = await fetch("/api/stories", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ topic: this.opts.topic }) });
      if (!res.ok) throw new Error("We couldn't start a new story. Please try again.");
      const { id } = (await res.json()) as { id: string };
      this.set({ storyId: id });
      if (this.destroyed) return;

      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const tracks = [...this.opts.stream.getVideoTracks(), ...recordingAudio.stream.getAudioTracks()];
      const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType, videoBitsPerSecond: 2_000_000, audioBitsPerSecond: 128_000 });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.upload(e.data);
      };
      this.recorderStopped = new Promise((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
      recorder.start(4000);
      this.recorder = recorder;
      this.runningSince = performance.now();
      this.tickTimer = setInterval(() => this.tick(), 100);
      this.keepAliveTimer = setInterval(() => {
        // An empty upload just marks the recording as still in use; a missed one does no harm.
        if (this.view.paused) void fetch(`/api/stories/${id}/chunk`, { method: "POST", body: new Blob([]) }).catch(() => {});
      }, PAUSED_KEEPALIVE_MS);
      setTimeout(() => void this.captureThumbnail(), 4000);
    } catch (err) {
      this.fail(err instanceof Error ? err.message : "Something went wrong starting the recording.");
      return;
    }
    void this.interviewerTurn("start");
  }

  // ---------- controls ----------

  /** "I'm done answering" (also called automatically after a long enough pause). */
  finishAnswer() {
    if (this.view.phase !== "listening" || this.view.paused) return;
    const text = this.endAnswer();
    if (text) {
      this.history.push({ role: "storyteller", text });
      void this.interviewerTurn("answer");
    } else if (!this.captionsWorking) {
      this.history.push({ role: "storyteller", text: "[They answered, but their words could not be transcribed.]" });
      void this.interviewerTurn("answer");
    } else {
      void this.interviewerTurn("unheard");
    }
  }

  async repeatQuestion() {
    if (this.view.phase !== "listening" || this.view.paused) return;
    clearInterval(this.silenceTimer);
    this.recognizer.stop();
    const last = [...this.history].reverse().find((h) => h.role === "interviewer");
    if (last) await this.say(last.text);
    if (this.destroyed || this.saving) return;
    if (this.wrapRequested) {
      const text = this.endAnswer();
      if (text) this.history.push({ role: "storyteller", text });
      return void this.interviewerTurn("wrap");
    }
    this.listen(true);
  }

  askSomethingElse() {
    if (this.view.phase !== "listening" || this.view.paused) return;
    const text = this.endAnswer();
    if (text) this.history.push({ role: "storyteller", text });
    void this.interviewerTurn("skip");
  }

  pause() {
    if (this.view.paused || !["thinking", "speaking", "listening"].includes(this.view.phase)) return;
    if (this.runningSince !== null) {
      this.elapsedMs += performance.now() - this.runningSince;
      this.runningSince = null;
    }
    if (this.recorder?.state === "recording") this.recorder.pause();
    void this.ctx?.suspend();
    this.player?.pause();
    if (this.view.phase === "listening") {
      clearInterval(this.silenceTimer);
      this.recognizer.stop();
    }
    this.set({ paused: true, level: 0 });
  }

  resume() {
    if (!this.view.paused) return;
    void this.ctx?.resume();
    this.player?.resume();
    if (this.recorder?.state === "paused") this.recorder.resume();
    this.runningSince = performance.now();
    this.set({ paused: false });
    if (this.view.phase === "listening") this.listen(true);
    this.pauseWaiters.splice(0).forEach((resolve) => resolve());
  }

  /** "Finish & save": the interviewer says goodbye, then the recording stops and is saved. */
  finish() {
    if (this.wrapRequested || this.saving || this.view.phase === "done" || this.view.phase === "error") return;
    this.wrapRequested = true;
    this.set({ finishing: true });
    if (this.view.paused) this.resume();
    if (this.view.phase === "listening") {
      const text = this.endAnswer();
      if (text) this.history.push({ role: "storyteller", text });
      void this.interviewerTurn("wrap");
    }
    // While thinking or speaking, interviewerTurn notices wrapRequested when the current step ends.
  }

  /**
   * The window is closing mid-interview: there's no time for a normal save, so hand the
   * transcript to the browser to deliver after the page is gone. The video is already on the
   * server (up to the last few seconds).
   */
  saveOnExit() {
    if (!this.recorder || this.saving || !this.view.storyId) return;
    if (!["thinking", "speaking", "listening"].includes(this.view.phase)) return;
    this.saving = true;
    if (this.view.phase === "listening") {
      const text = this.recognizer.text.trim();
      if (text) this.events.push({ kind: "answer", t: this.answerStart, end: this.clock(), text, segments: [...this.recognizer.segments] });
    }
    const body = JSON.stringify({ events: this.events, durationSec: this.clock() });
    navigator.sendBeacon(`/api/stories/${this.view.storyId}/finish`, new Blob([body], { type: "application/json" }));
  }

  /** Leaving the page: stop everything, but keep whatever was recorded. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.player?.cancel();
    this.pauseWaiters.splice(0).forEach((resolve) => resolve());
    if (this.recorder && !this.saving && ["thinking", "speaking", "listening"].includes(this.view.phase)) {
      if (this.view.phase === "listening") this.endAnswer();
      void this.stopAndSave();
    } else if (!this.saving) {
      this.stopTimers();
      this.recognizer.stop();
      this.releaseAudio();
    }
  }

  // ---------- the conversation loop ----------

  private async interviewerTurn(action: InterviewAction): Promise<void> {
    if (this.destroyed || this.saving) return;
    this.set({ phase: "thinking" });
    const checkIn = action === "answer" && this.clock() - this.lastCheckInSec >= CHECK_IN_EVERY_SEC;
    if (checkIn) this.lastCheckInSec = this.clock();

    const fallback =
      action === "wrap"
        ? "Thank you so much for sharing your stories with me today. Goodbye for now."
        : "I'm sorry, I lost my train of thought for a moment. Could you tell me a little more about that?";
    let reply: AsyncIterator<string>;
    try {
      const res = await fetch("/api/interview/next", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ topic: this.opts.topic, history: this.history, action, elapsedSec: Math.round(this.clock()), checkIn }),
      });
      if (!res.ok || !res.body) throw new Error(`interview ${res.status}`);
      reply = readSentences(res.body);
    } catch {
      reply = readSentences(null, fallback);
    }

    // Wait for the first sentence before deciding to speak: the person may have paused or pressed Finish meanwhile.
    const first = await reply.next().catch((): IteratorResult<string> => ({ done: true, value: undefined }));
    await this.waitWhilePaused();
    if (this.destroyed || this.saving) return void reply.return?.();
    if (this.wrapRequested && action !== "wrap") {
      void reply.return?.();
      return this.interviewerTurn("wrap");
    }

    const sentences = (async function* (): AsyncGenerator<string> {
      if (first.done) {
        yield fallback;
        return;
      }
      yield first.value;
      for (let next = await reply.next(); !next.done; next = await reply.next()) yield next.value;
    })();
    const said = await this.say(sentences);
    this.history.push({ role: "interviewer", text: said || fallback });
    if (this.destroyed || this.saving) return;
    if (action === "wrap") return this.stopAndSave();
    if (this.wrapRequested) return this.interviewerTurn("wrap");
    this.listen(false);
  }

  /** Speaks, shows each sentence on screen as it's spoken, and returns everything that was said. */
  private async say(text: string | AsyncIterable<string>): Promise<string> {
    const spoken: string[] = [];
    let t = this.clock();
    this.setMicVolume(MIC_WHILE_INTERVIEWER_TALKS);
    const onSentence = (sentence: string) => {
      if (!spoken.length) t = this.clock();
      spoken.push(sentence);
      this.set({ phase: "speaking", question: spoken.join(" ") });
    };
    if (typeof text === "string") await this.player?.speak(text, onSentence);
    else await this.player?.speakStream(text, onSentence);
    this.setMicVolume(1);
    const said = spoken.join(" ");
    if (said) this.events.push({ kind: "question", t, end: this.clock(), text: said });
    return said;
  }

  private listen(keep: boolean) {
    if (!keep) {
      this.answerStart = this.clock();
      this.loudMs = 0;
    }
    this.lastLoudAt = 0;
    this.set({ phase: "listening", heard: keep ? this.recognizer.text : "" });
    this.recognizer.start(keep);
    clearInterval(this.silenceTimer);
    this.silenceTimer = setInterval(() => this.checkSilence(), 250);
  }

  /** Decides when an answer is finished: a long enough pause after the storyteller has said something. */
  private checkSilence() {
    if (this.view.paused || this.view.phase !== "listening") return;
    const now = Date.now();
    if (this.captionsWorking) {
      if (!this.recognizer.text) return;
      const heardAt = this.recognizer.lastHeardAt;
      // Loud mic input also counts as talking (so slow captions don't cut anyone off), but only
      // shortly after recognised words, so background noise can't hold the turn open forever.
      const talkingAt = now - heardAt < 8000 ? Math.max(heardAt, this.lastLoudAt) : heardAt;
      if (now - talkingAt > this.opts.silenceMs) this.finishAnswer();
    } else if (this.loudMs >= 1500 && this.lastLoudAt && now - this.lastLoudAt > this.opts.silenceMs + 1000) {
      // No captions: fall back to the microphone level alone.
      this.finishAnswer();
    }
  }

  private endAnswer(): string {
    clearInterval(this.silenceTimer);
    const text = this.recognizer.stop().trim();
    if (text || !this.captionsWorking) {
      this.events.push({ kind: "answer", t: this.answerStart, end: this.clock(), text, segments: [...this.recognizer.segments] });
    }
    return text;
  }

  // ---------- recording ----------

  private tick() {
    if (!this.analyser || !this.levelData) return;
    const level = this.view.paused ? 0 : levelOf(this.analyser, this.levelData);
    if (level > TALKING_LEVEL && this.view.phase === "listening") {
      this.lastLoudAt = Date.now();
      this.loudMs += 100;
    }
    const elapsedSec = Math.floor(this.clock());
    if (Math.abs(level - this.view.level) > 0.03 || elapsedSec !== this.view.elapsedSec) this.set({ level, elapsedSec });
  }

  private setMicVolume(volume: number) {
    if (this.micGain && this.ctx) this.micGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
  }

  private upload(chunk: Blob) {
    const id = this.view.storyId;
    this.uploads = this.uploads.then(async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(`/api/stories/${id}/chunk`, {
            method: "POST",
            headers: { "content-type": "application/octet-stream" },
            body: chunk,
          });
          if (res.ok) return;
        } catch {}
        await sleep(1000 * attempt);
      }
      this.uploadFailed = true;
    });
  }

  private async captureThumbnail() {
    const track = this.opts.stream.getVideoTracks()[0];
    if (!track || this.destroyed || this.saving) return;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    try {
      await video.play();
      const width = 640;
      const height = Math.round((width * video.videoHeight) / video.videoWidth) || 360;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
      this.thumbnail = canvas.toDataURL("image/jpeg", 0.8);
    } catch {
      // A missing thumbnail is fine; the story card shows a placeholder.
    } finally {
      video.pause();
      video.srcObject = null;
    }
  }

  private async stopAndSave() {
    if (this.saving) return;
    this.saving = true;
    this.stopTimers();
    this.recognizer.stop();
    const durationSec = this.clock();
    if (this.runningSince !== null) {
      this.elapsedMs += performance.now() - this.runningSince;
      this.runningSince = null;
    }
    this.set({ phase: "saving", paused: false, level: 0 });
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
      await this.recorderStopped;
      await this.uploads;
      const res = await fetch(`/api/stories/${this.view.storyId}/finish`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ events: this.events, durationSec, thumbnail: this.thumbnail }),
      });
      if (!res.ok) throw new Error("Your story couldn't be saved. Please try again.");
      this.set({
        phase: "done",
        error: this.uploadFailed ? "Part of the video couldn't be saved, so some of it may be missing." : null,
      });
    } catch (err) {
      this.set({ phase: "error", error: err instanceof Error ? err.message : "Your story couldn't be saved." });
    } finally {
      this.releaseAudio();
    }
  }

  private fail(message: string) {
    this.stopTimers();
    this.recognizer.stop();
    this.player?.cancel();
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.releaseAudio();
    this.set({ phase: "error", error: message });
  }

  private stopTimers() {
    clearInterval(this.silenceTimer);
    clearInterval(this.tickTimer);
    clearInterval(this.keepAliveTimer);
  }

  private releaseAudio() {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  private waitWhilePaused(): Promise<void> {
    if (!this.view.paused || this.destroyed) return Promise.resolve();
    return new Promise((resolve) => this.pauseWaiters.push(resolve));
  }
}
