import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { DATA_DIR, ensureDataDirs, partialVideoFile, removeFiles, thumbFile, videoFile } from "./files";
import { DEFAULT_SETTINGS } from "./voices";
import type { PublicUser, Story, StoryEvent, StoryStatus, User, UserSettings, Visibility } from "./types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'storyteller',
  pin_hash TEXT NOT NULL,
  birth_year INTEGER,
  hometown TEXT NOT NULL DEFAULT '',
  work TEXT NOT NULL DEFAULT '',
  interests TEXT NOT NULL DEFAULT '',
  about TEXT NOT NULL DEFAULT '',
  photo_version INTEGER NOT NULL DEFAULT 0,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  events TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'recording',
  visibility TEXT NOT NULL DEFAULT 'everyone',
  duration_sec REAL NOT NULL DEFAULT 0,
  has_thumb INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS stories_by_user ON stories(user_id, created_at);
`;

function open(): DatabaseSync {
  ensureDataDirs();
  const db = new DatabaseSync(path.join(DATA_DIR, "life-stories.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

// Reuse one connection across hot reloads in development.
const globalForDb = globalThis as unknown as { __lifeStoriesDb?: DatabaseSync };
const db = (globalForDb.__lifeStoriesDb ??= open());

const now = () => new Date().toISOString();

// ---------- users ----------

type UserRow = {
  id: string;
  name: string;
  role: string;
  pin_hash: string;
  birth_year: number | null;
  hometown: string;
  work: string;
  interests: string;
  about: string;
  photo_version: number;
  settings: string;
  created_at: string;
};

function toUser(r: UserRow): User {
  let settings: Partial<UserSettings> = {};
  try {
    settings = JSON.parse(r.settings);
  } catch {}
  return {
    id: r.id,
    name: r.name,
    role: r.role === "listener" ? "listener" : "storyteller",
    birthYear: r.birth_year,
    hometown: r.hometown,
    work: r.work,
    interests: r.interests,
    about: r.about,
    photoVersion: r.photo_version,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    createdAt: r.created_at,
  };
}

export const toPublicUser = (u: User): PublicUser => ({ id: u.id, name: u.name, photoVersion: u.photoVersion });

function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 32).toString("hex")}`;
}

export function listUsers(): User[] {
  return (db.prepare("SELECT * FROM users ORDER BY name COLLATE NOCASE").all() as UserRow[]).map(toUser);
}

export function getUser(id: string): User | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export interface ProfileFields {
  name: string;
  birthYear: number | null;
  hometown: string;
  work: string;
  interests: string;
  about: string;
}

export function createUser(fields: ProfileFields & { pin: string }): User {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO users (id, name, pin_hash, birth_year, hometown, work, interests, about, settings, created_at)
     VALUES (:id, :name, :pin_hash, :birth_year, :hometown, :work, :interests, :about, :settings, :created_at)`,
  ).run({
    id,
    name: fields.name,
    pin_hash: hashPin(fields.pin),
    birth_year: fields.birthYear,
    hometown: fields.hometown,
    work: fields.work,
    interests: fields.interests,
    about: fields.about,
    settings: JSON.stringify(DEFAULT_SETTINGS),
    created_at: now(),
  });
  return getUser(id)!;
}

export function updateUser(
  id: string,
  patch: Partial<ProfileFields & { settings: UserSettings; bumpPhoto: boolean; removePhoto: boolean }>,
) {
  const sets: string[] = [];
  const params: Record<string, SQLInputValue> = { id };
  const columns: [keyof ProfileFields, string][] = [
    ["name", "name"],
    ["birthYear", "birth_year"],
    ["hometown", "hometown"],
    ["work", "work"],
    ["interests", "interests"],
    ["about", "about"],
  ];
  for (const [key, col] of columns) {
    if (patch[key] !== undefined) {
      sets.push(`${col} = :${col}`);
      params[col] = patch[key];
    }
  }
  if (patch.settings) {
    sets.push("settings = :settings");
    params.settings = JSON.stringify(patch.settings);
  }
  if (patch.bumpPhoto) sets.push("photo_version = photo_version + 1");
  if (patch.removePhoto) sets.push("photo_version = 0");
  if (!sets.length) return;
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = :id`).run(params);
}

export function verifyPin(userId: string, pin: string): boolean {
  const row = db.prepare("SELECT pin_hash FROM users WHERE id = ?").get(userId) as { pin_hash: string } | undefined;
  if (!row) return false;
  const [salt, hash] = row.pin_hash.split(":");
  const attempt = crypto.scryptSync(pin, salt, 32);
  return crypto.timingSafeEqual(attempt, Buffer.from(hash, "hex"));
}

// ---------- sessions ----------

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(token, userId, now());
  return token;
}

export function getSessionUser(token: string): User | null {
  const row = db
    .prepare("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?")
    .get(token) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function deleteSession(token: string) {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

// ---------- stories ----------

type StoryRow = {
  id: string;
  user_id: string;
  topic: string;
  title: string;
  summary: string;
  tags: string;
  events: string;
  status: string;
  visibility: string;
  duration_sec: number;
  has_thumb: number;
  created_at: string;
  author_name: string;
  author_photo: number;
};

const STORY_SELECT = `
  SELECT s.*, u.name AS author_name, u.photo_version AS author_photo
  FROM stories s JOIN users u ON u.id = s.user_id`;

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function toStory(r: StoryRow): Story {
  return {
    id: r.id,
    userId: r.user_id,
    topic: r.topic,
    title: r.title,
    summary: r.summary,
    tags: parseJson<string[]>(r.tags, []),
    events: parseJson<StoryEvent[]>(r.events, []),
    status: r.status as StoryStatus,
    visibility: r.visibility === "private" ? "private" : "everyone",
    durationSec: r.duration_sec,
    hasThumb: r.has_thumb === 1,
    createdAt: r.created_at,
    author: { id: r.user_id, name: r.author_name, photoVersion: r.author_photo },
  };
}

export function createStory(userId: string, topic: string): string {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO stories (id, user_id, topic, created_at) VALUES (?, ?, ?, ?)").run(id, userId, topic, now());
  return id;
}

export function getStory(id: string): Story | null {
  const row = db.prepare(`${STORY_SELECT} WHERE s.id = ?`).get(id) as StoryRow | undefined;
  return row ? toStory(row) : null;
}

/** A person's finished stories; private ones only when the viewer is that person. */
export function listStoriesByUser(userId: string, viewerId: string | null): Story[] {
  const rows = db
    .prepare(
      `${STORY_SELECT}
       WHERE s.user_id = :userId AND s.status != 'recording'
         AND (s.visibility = 'everyone' OR s.user_id = :viewerId)
       ORDER BY s.created_at DESC`,
    )
    .all({ userId, viewerId: viewerId ?? "" }) as StoryRow[];
  return rows.map(toStory);
}

export function listRecentStories(excludeUserId: string | null, limit = 12): Story[] {
  const rows = db
    .prepare(
      `${STORY_SELECT}
       WHERE s.status != 'recording' AND s.visibility = 'everyone' AND s.user_id != :exclude
       ORDER BY s.created_at DESC LIMIT :limit`,
    )
    .all({ exclude: excludeUserId ?? "", limit }) as StoryRow[];
  return rows.map(toStory);
}

/** Stories still recording or being summarized (possibly cut off by a closed window or a restart). */
export function listUnfinishedStories(userId: string): Story[] {
  const rows = db.prepare(`${STORY_SELECT} WHERE s.user_id = ? AND s.status IN ('recording', 'processing')`).all(userId) as StoryRow[];
  return rows.map(toStory);
}

export interface StoryPatch {
  title?: string;
  summary?: string;
  tags?: string[];
  events?: StoryEvent[];
  status?: StoryStatus;
  visibility?: Visibility;
  durationSec?: number;
  hasThumb?: boolean;
}

export function updateStory(id: string, patch: StoryPatch) {
  const sets: string[] = [];
  const params: Record<string, SQLInputValue> = { id };
  const add = (col: string, value: SQLInputValue) => {
    sets.push(`${col} = :${col}`);
    params[col] = value;
  };
  if (patch.title !== undefined) add("title", patch.title);
  if (patch.summary !== undefined) add("summary", patch.summary);
  if (patch.tags !== undefined) add("tags", JSON.stringify(patch.tags));
  if (patch.events !== undefined) add("events", JSON.stringify(patch.events));
  if (patch.status !== undefined) add("status", patch.status);
  if (patch.visibility !== undefined) add("visibility", patch.visibility);
  if (patch.durationSec !== undefined) add("duration_sec", patch.durationSec);
  if (patch.hasThumb !== undefined) add("has_thumb", patch.hasThumb ? 1 : 0);
  if (!sets.length) return;
  db.prepare(`UPDATE stories SET ${sets.join(", ")} WHERE id = :id`).run(params);
}

export async function deleteStory(id: string) {
  db.prepare("DELETE FROM stories WHERE id = ?").run(id);
  await removeFiles(videoFile(id), partialVideoFile(id), thumbFile(id));
}
