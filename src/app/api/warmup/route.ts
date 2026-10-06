import { brainInfo, warmUpBrain } from "@/lib/ai";
import { primeInterviewer } from "@/lib/interviewer";
import { currentUser } from "@/lib/session";
import { loadVoiceModel } from "@/lib/tts";

/**
 * Called when the recording studio opens: loads the AI model and the voice into memory, and has
 * the model read this person's interviewer instructions, so the first question comes quickly.
 */
export async function POST() {
  const user = await currentUser();
  const [brain, voice] = await Promise.allSettled([
    warmUpBrain().then(() => (user ? primeInterviewer(user).catch(() => {}) : undefined)),
    loadVoiceModel(),
  ]);
  return Response.json({
    brain: brain.status === "fulfilled",
    brainError: brain.status === "rejected" ? (brain.reason as Error).message : null,
    voice: voice.status === "fulfilled",
    info: brainInfo(),
  });
}
