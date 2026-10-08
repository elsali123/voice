/**
 * Limits wrong PIN guesses: a 4-digit PIN has only 10,000 possibilities. After 5 wrong tries,
 * that person's sign-in is locked for 5 minutes.
 */

const MAX_TRIES = 5;
const LOCK_MS = 5 * 60_000;

type Tries = { fails: number; lockedUntil: number };

// Kept across hot reloads in development.
const g = globalThis as unknown as { __pinTries?: Map<string, Tries> };
const tries = (g.__pinTries ??= new Map());

/** Milliseconds until this person can try again (0 if not locked). */
export function lockedFor(userId: string): number {
  const t = tries.get(userId);
  return t ? Math.max(0, t.lockedUntil - Date.now()) : 0;
}

/** Records a wrong PIN. Returns true if that locked the sign-in. */
export function recordWrongPin(userId: string): boolean {
  const t = tries.get(userId) ?? { fails: 0, lockedUntil: 0 };
  t.fails++;
  if (t.fails >= MAX_TRIES) {
    t.fails = 0;
    t.lockedUntil = Date.now() + LOCK_MS;
  }
  tries.set(userId, t);
  return t.lockedUntil > Date.now();
}

export function clearWrongPins(userId: string) {
  tries.delete(userId);
}
