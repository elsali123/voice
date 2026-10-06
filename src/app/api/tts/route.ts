import { synthesize } from "@/lib/tts";
import { readJson, text } from "@/lib/validate";
import { DEFAULT_SETTINGS, isVoiceId } from "@/lib/voices";

/** Speaks a sentence with the on-device Kokoro voice and returns WAV audio. */
export async function POST(req: Request) {
  const body = await readJson(req);
  const words = text(body.text, 600);
  if (!words) return Response.json({ error: "Nothing to say" }, { status: 400 });
  const voice = isVoiceId(body.voice) ? body.voice : DEFAULT_SETTINGS.voice;
  const speed = typeof body.speed === "number" ? Math.min(1.2, Math.max(0.7, body.speed)) : DEFAULT_SETTINGS.speed;
  try {
    const wav = await synthesize(words, voice, speed);
    return new Response(wav, { headers: { "content-type": "audio/wav", "cache-control": "no-store" } });
  } catch (err) {
    console.error("[voice] synthesis failed:", err);
    return Response.json({ error: "The interviewer's voice isn't available." }, { status: 503 });
  }
}
