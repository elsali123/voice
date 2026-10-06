// Runs the Kokoro voice model on its own thread. Speech synthesis is CPU-heavy and would
// otherwise freeze the web server (and every request) for seconds at a time.
import { parentPort } from "node:worker_threads";
import { KokoroTTS } from "kokoro-js";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

let model = null;
function load() {
  // fp16 measured ~3x faster than q8 on Apple silicon CPUs, at half the size of fp32.
  model ??= KokoroTTS.from_pretrained(MODEL_ID, { dtype: "fp16", device: "cpu" }).catch((err) => {
    model = null;
    throw err;
  });
  return model;
}

// One request at a time, in order, so sentences come back in the order they were asked for.
let queue = Promise.resolve();
parentPort.on("message", (msg) => {
  queue = queue.then(async () => {
    try {
      const tts = await load();
      if (msg.type === "load") return parentPort.postMessage({ id: msg.id, ok: true });
      const audio = await tts.generate(msg.text, { voice: msg.voice, speed: msg.speed });
      const wav = audio.toWav();
      parentPort.postMessage({ id: msg.id, ok: true, wav }, [wav]);
    } catch (err) {
      parentPort.postMessage({ id: msg.id, ok: false, error: String(err?.message ?? err) });
    }
  });
});
