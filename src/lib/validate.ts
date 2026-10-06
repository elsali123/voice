/** Small helpers for checking request bodies. */

export const text = (v: unknown, max = 300): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function birthYear(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) : NaN;
  return Number.isInteger(n) && n >= 1900 && n <= new Date().getFullYear() ? n : null;
}

export const isPin = (v: unknown): v is string => typeof v === "string" && /^\d{4}$/.test(v);

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const badRequest = (error: string) => Response.json({ error }, { status: 400 });
