import type { PauseWait, UserSettings } from "./types";

/** Kokoro voices offered to storytellers (the highest-rated English voices). */
export const VOICES = [
  { id: "af_heart", label: "Heart", description: "Warm American woman" },
  { id: "af_bella", label: "Bella", description: "Bright American woman" },
  { id: "bf_emma", label: "Emma", description: "Gentle British woman" },
  { id: "am_michael", label: "Michael", description: "Calm American man" },
  { id: "bm_george", label: "George", description: "Friendly British man" },
] as const;

export const SPEEDS = [
  { value: 0.82, label: "Slower" },
  { value: 0.9, label: "Relaxed" },
  { value: 1, label: "Normal" },
] as const;

export const PAUSE_WAITS: { value: PauseWait; label: string; hint: string; ms: number }[] = [
  { value: "short", label: "Short", hint: "about 2 seconds", ms: 2000 },
  { value: "medium", label: "Medium", hint: "about 3½ seconds", ms: 3500 },
  { value: "long", label: "Long", hint: "about 6 seconds", ms: 6000 },
];

export const DEFAULT_SETTINGS: UserSettings = {
  voice: "af_heart",
  speed: 0.9,
  pauseWait: "medium",
};

export function isVoiceId(v: unknown): v is string {
  return VOICES.some((x) => x.id === v);
}

export function pauseWaitMs(p: PauseWait): number {
  return PAUSE_WAITS.find((x) => x.value === p)?.ms ?? 3500;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
