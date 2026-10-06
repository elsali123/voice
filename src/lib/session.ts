import { cookies } from "next/headers";
import { createSession, deleteSession, getSessionUser } from "./db";
import type { User } from "./types";

const SESSION_COOKIE = "ls_session";

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? getSessionUser(token) : null;
}

/** Call from Route Handlers only (cookies can't be set while rendering). */
export async function startSession(userId: string) {
  const token = createSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) deleteSession(token);
  store.delete(SESSION_COOKIE);
}

export const unauthorized = () => Response.json({ error: "Please sign in first." }, { status: 401 });
