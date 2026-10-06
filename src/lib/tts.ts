import path from "node:path";
import type { Worker } from "node:worker_threads";

// Loaded this way so the bundler leaves `new Worker(...)` alone; it would otherwise try to bundle
// the worker file itself and break it.
const { Worker: NodeWorker } = process.getBuiltinModule("node:worker_threads");

/**
 * The interviewer's voice: Kokoro, a free open-source text-to-speech model that runs on this
 * computer, in a worker thread (workers/tts-worker.mjs) so the server stays responsive.
 * The model (~160 MB) downloads from Hugging Face on first use.
 */

type Reply = { id: number; ok: boolean; wav?: ArrayBuffer; error?: string };
type Pending = { resolve: (wav: ArrayBuffer) => void; reject: (err: Error) => void };
interface VoiceWorker {
  worker: Worker;
  pending: Map<number, Pending>;
  nextId: number;
  ready?: Promise<void>;
}

// One worker for the whole server, kept across hot reloads in development.
const g = globalThis as unknown as { __voiceWorker?: VoiceWorker };

function voiceWorker(): VoiceWorker {
  if (g.__voiceWorker) return g.__voiceWorker;
  const worker = new NodeWorker(path.join(process.cwd(), "workers", "tts-worker.mjs"));
  const state: VoiceWorker = { worker, pending: new Map(), nextId: 1 };
  const failAll = (err: Error) => {
    for (const p of state.pending.values()) p.reject(err);
    state.pending.clear();
    if (g.__voiceWorker === state) g.__voiceWorker = undefined;
  };
  worker.on("message", (reply: Reply) => {
    const p = state.pending.get(reply.id);
    if (!p) return;
    state.pending.delete(reply.id);
    if (reply.ok) p.resolve(reply.wav ?? new ArrayBuffer(0));
    else p.reject(new Error(reply.error));
  });
  worker.on("error", (err: Error) => {
    console.error("[voice] worker crashed:", err);
    failAll(err);
  });
  worker.on("exit", (code) => failAll(new Error(`voice worker exited (${code})`)));
  g.__voiceWorker = state;
  return state;
}

function call(message: Record<string, unknown>): Promise<ArrayBuffer> {
  const state = voiceWorker();
  const id = state.nextId++;
  return new Promise((resolve, reject) => {
    state.pending.set(id, { resolve, reject });
    state.worker.postMessage({ ...message, id });
  });
}

export function loadVoiceModel(): Promise<void> {
  const state = voiceWorker();
  if (!state.ready) {
    const started = Date.now();
    state.ready = call({ type: "load" }).then(
      () => console.log(`[voice] Kokoro ready in ${((Date.now() - started) / 1000).toFixed(1)}s`),
      (err) => {
        console.error("[voice] Kokoro failed to load:", err);
        state.ready = undefined;
        throw err;
      },
    );
  }
  return state.ready;
}

/** Returns WAV audio for one sentence. */
export function synthesize(text: string, voice: string, speed: number): Promise<ArrayBuffer> {
  return call({ type: "speak", text, voice, speed });
}
