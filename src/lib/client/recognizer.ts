import type { Segment } from "../types";

/**
 * Wraps the browser's free built-in speech recognition (Chrome's Web Speech API).
 * Chrome stops listening on its own every so often, so this restarts it until told to stop.
 */

interface SRAlternative {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  0: SRAlternative;
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [index: number]: SRResult };
}
interface SRInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SRConstructor = new () => SRInstance;

export function speechRecognitionAvailable(): boolean {
  return getConstructor() !== null;
}

function getConstructor(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b);

export class Recognizer {
  readonly supported: boolean;
  /** Finished phrases of the current answer. */
  committed = "";
  /** The phrase still being spoken (may change). */
  interim = "";
  segments: Segment[] = [];
  /** Date.now() of the last words heard. */
  lastHeardAt = 0;
  onChange?: () => void;
  onFatal?: (message: string) => void;

  private rec: SRInstance | null = null;
  private wanted = false;
  private active = false;
  private running = false;
  private phraseStart: number | null = null;

  constructor(private clock: () => number, lang = "en-US") {
    const SR = getConstructor();
    this.supported = !!SR;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      if (!this.active) return;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const words = result[0].transcript.trim();
        if (result.isFinal) {
          if (words) {
            this.committed = join(this.committed, words);
            this.segments.push({ t0: this.phraseStart ?? Math.max(0, this.clock() - 2), t1: this.clock(), text: words });
          }
          this.phraseStart = null;
        } else {
          interim = join(interim, words);
        }
      }
      if (interim && this.phraseStart === null) this.phraseStart = this.clock();
      this.interim = interim;
      this.lastHeardAt = Date.now();
      this.onChange?.();
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.wanted = false;
        this.onFatal?.("Live captions are blocked. You can still record; tap “I’m done answering” after each answer.");
      } else if (e.error === "network") {
        this.onFatal?.("Live captions need an internet connection. You can still record; tap “I’m done answering” after each answer.");
      }
      // "no-speech" and "aborted" are normal; onend restarts listening.
    };

    rec.onend = () => {
      this.running = false;
      if (this.wanted) setTimeout(() => this.safeStart(), 150);
    };

    this.rec = rec;
  }

  get text(): string {
    return join(this.committed, this.interim);
  }

  /** Start listening. `keep` continues the same answer (after a pause or a repeated question). */
  start(keep = false) {
    if (!keep) {
      this.committed = "";
      this.interim = "";
      this.segments = [];
      this.phraseStart = null;
    }
    this.active = true;
    this.wanted = true;
    this.lastHeardAt = Date.now();
    this.safeStart();
  }

  /** Stop listening and return everything heard for this answer. */
  stop(): string {
    this.active = false;
    this.wanted = false;
    if (this.interim) {
      this.committed = join(this.committed, this.interim);
      this.segments.push({ t0: this.phraseStart ?? this.clock(), t1: this.clock(), text: this.interim });
      this.interim = "";
      this.phraseStart = null;
    }
    try {
      this.rec?.abort();
    } catch {}
    return this.committed;
  }

  private safeStart() {
    if (!this.rec || !this.wanted || this.running) return;
    try {
      this.rec.start();
      this.running = true;
    } catch {
      // Already started; onend will restart it if needed.
    }
  }
}
