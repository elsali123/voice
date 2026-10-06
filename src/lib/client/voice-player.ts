import { splitSentences } from "../sentences";

/**
 * Plays the interviewer's voice, one sentence at a time: each sentence starts playing as soon as
 * its audio is ready, while the next one is being written and voiced (about 1.5 seconds to first
 * sound). If the on-device voice isn't available, the browser's built-in voice is used.
 */

const PREFERRED_BROWSER_VOICES = ["Samantha", "Ava", "Allison", "Susan", "Karen", "Moira", "Daniel", "Google US English"];

function pickBrowserVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const english = voices.filter((v) => v.lang.startsWith("en"));
  return (
    english.find((v) => /premium|enhanced/i.test(v.name)) ??
    PREFERRED_BROWSER_VOICES.map((n) => english.find((v) => v.name.startsWith(n))).find(Boolean) ??
    english[0] ??
    null
  );
}

async function fetchSpeech(text: string, voice: string, speed: number): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, voice, speed }),
    });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

function speakWithBrowser(text: string, speed: number, isCancelled: () => boolean): Promise<void> {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth) return Promise.resolve();
  // One utterance per sentence: Chrome cuts off long utterances.
  return splitSentences(text).reduce<Promise<void>>(
    (prev, sentence) =>
      prev.then(() => {
        if (isCancelled()) return;
        return new Promise<void>((resolve) => {
          const u = new SpeechSynthesisUtterance(sentence);
          u.rate = speed;
          const v = pickBrowserVoice();
          if (v) u.voice = v;
          u.onend = () => resolve();
          u.onerror = () => resolve();
          synth.speak(u);
        });
      }),
    Promise.resolve(),
  );
}

export class VoicePlayer {
  /** True once the on-device voice has failed and the browser voice is being used instead. */
  browserMode = false;
  private failures = 0;
  private cache = new Map<string, AudioBuffer>();
  private source: AudioBufferSourceNode | null = null;
  private cancelled = false;

  /** `outputs`: where the voice goes, e.g. the speakers and the recording. */
  constructor(
    private ctx: AudioContext,
    private outputs: AudioNode[],
    private voice: string,
    private speed: number,
  ) {}

  /** Speaks a known piece of text (e.g. repeating the question). */
  speak(text: string, onSentence?: (sentence: string) => void): Promise<void> {
    return this.speakStream(fromArray(splitSentences(text)), onSentence);
  }

  /** Speaks sentences as they arrive. `onSentence` fires as each one starts playing. */
  async speakStream(sentences: AsyncIterable<string>, onSentence?: (sentence: string) => void): Promise<void> {
    this.cancelled = false;
    const it = sentences[Symbol.asyncIterator]();
    // Fetch the next sentence's text and audio while the current one plays.
    const prepare = async (): Promise<{ text: string; audio: AudioBuffer | null } | null> => {
      try {
        const next = await it.next();
        if (next.done) return null;
        return { text: next.value, audio: this.browserMode ? null : await this.load(next.value) };
      } catch {
        return null; // the reply stream broke off; stop after what was said
      }
    };
    let upcoming = prepare();
    for (;;) {
      const item = await upcoming;
      if (!item || this.cancelled) break;
      upcoming = prepare();
      onSentence?.(item.text);
      if (item.audio) {
        this.failures = 0;
        await this.play(item.audio);
      } else {
        if (!this.browserMode && ++this.failures >= 2) this.browserMode = true;
        await speakWithBrowser(item.text, this.speed, () => this.cancelled);
      }
      if (this.cancelled) break;
    }
    if (this.cancelled) void it.return?.();
  }

  cancel() {
    this.cancelled = true;
    try {
      this.source?.stop();
    } catch {}
    window.speechSynthesis?.cancel();
  }

  pause() {
    window.speechSynthesis?.pause();
  }

  resume() {
    window.speechSynthesis?.resume();
  }

  private async load(sentence: string): Promise<AudioBuffer | null> {
    const key = `${this.voice}|${this.speed}|${sentence}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const wav = await fetchSpeech(sentence, this.voice, this.speed);
    if (!wav) return null;
    try {
      const buffer = await this.ctx.decodeAudioData(wav);
      this.cache.set(key, buffer);
      if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value!);
      return buffer;
    } catch {
      return null;
    }
  }

  private play(buffer: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      for (const out of this.outputs) src.connect(out);
      src.onended = () => {
        if (this.source === src) this.source = null;
        resolve();
      };
      this.source = src;
      src.start();
    });
  }
}

/** Plays a sample of a voice (settings page, sound check). */
async function* fromArray(items: string[]): AsyncGenerator<string> {
  yield* items;
}

export async function previewVoice(text: string, voice: string, speed: number): Promise<void> {
  const wav = await fetchSpeech(text, voice, speed);
  if (!wav) return speakWithBrowser(text, speed, () => false);
  const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  try {
    const audio = new Audio(url);
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
