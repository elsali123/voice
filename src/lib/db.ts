import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { DATA_DIR, ensureDataDirs, partialVideoFile, removeFiles, thumbFile, videoFile } from "./files";
import { DEFAULT_SETTINGS } from "./voices";
import type { Match, MatchStatus, PublicUser, Role, Story, StoryEvent, StoryStatus, User, UserSettings, Visibility } from "./types";

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
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  listener_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storyteller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'suggested',
  reason TEXT NOT NULL DEFAULT '',
  shared TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'ai',
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  UNIQUE (listener_id, storyteller_id)
);
`;

/** Columns added after the first version; added to existing databases on startup. */
const ADDED_USER_COLUMNS = ["age_group", "background", "goals"];

function open(): DatabaseSync {
  ensureDataDirs();
  const db = new DatabaseSync(path.join(DATA_DIR, "life-stories.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  const existing = new Set((db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name));
  for (const col of ADDED_USER_COLUMNS) {
    if (!existing.has(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`);
  }
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
  age_group: string;
  background: string;
  goals: string;
  photo_version: number;
  settings: string;
  created_at: string;
};

const ROLES: Role[] = ["storyteller", "listener", "coordinator"];

function toUser(r: UserRow): User {
  let settings: Partial<UserSettings> = {};
  try {
    settings = JSON.parse(r.settings);
  } catch {}
  return {
    id: r.id,
    name: r.name,
    role: ROLES.includes(r.role as Role) ? (r.role as Role) : "storyteller",
    birthYear: r.birth_year,
    hometown: r.hometown,
    work: r.work,
    interests: r.interests,
    about: r.about,
    ageGroup: r.age_group,
    background: r.background,
    goals: r.goals,
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

export function listUsersByRole(role: Role): User[] {
  return listUsers().filter((u) => u.role === role);
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
  ageGroup: string;
  background: string;
  goals: string;
}

export function createUser(fields: ProfileFields & { pin: string; role: Role }): User {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO users (id, name, role, pin_hash, birth_year, hometown, work, interests, about, age_group, background, goals, settings, created_at)
     VALUES (:id, :name, :role, :pin_hash, :birth_year, :hometown, :work, :interests, :about, :age_group, :background, :goals, :settings, :created_at)`,
  ).run({
    id,
    name: fields.name,
    role: fields.role,
    pin_hash: hashPin(fields.pin),
    birth_year: fields.birthYear,
    hometown: fields.hometown,
    work: fields.work,
    interests: fields.interests,
    about: fields.about,
    age_group: fields.ageGroup,
    background: fields.background,
    goals: fields.goals,
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
    ["ageGroup", "age_group"],
    ["background", "background"],
    ["goals", "goals"],
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

// ---------- matches (listener ↔ storyteller pairings) ----------

type MatchRow = {
  id: string;
  listener_id: string;
  storyteller_id: string;
  status: string;
  reason: string;
  shared: string;
  source: string;
  created_at: string;
  decided_at: string | null;
};

function toMatch(r: MatchRow): Match {
  return {
    id: r.id,
    listenerId: r.listener_id,
    storytellerId: r.storyteller_id,
    status: r.status as MatchStatus,
    reason: r.reason,
    shared: parseJson<string[]>(r.shared, []),
    source: r.source as Match["source"],
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };
}

/** Adds a suggested pairing. Does nothing if these two were already paired, suggested or declined. */
export function suggestMatch(m: Pick<Match, "listenerId" | "storytellerId" | "reason" | "shared" | "source">): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO matches (id, listener_id, storyteller_id, status, reason, shared, source, created_at)
       VALUES (?, ?, ?, 'suggested', ?, ?, ?, ?)`,
    )
    .run(crypto.randomUUID(), m.listenerId, m.storytellerId, m.reason, JSON.stringify(m.shared), m.source, now());
  return Number(result.changes) > 0;
}

/** A coordinator pairs two people directly (or approves an existing suggestion for them). */
export function pairDirectly(listenerId: string, storytellerId: string, reason: string, coordinatorId: string) {
  db.prepare(
    `INSERT INTO matches (id, listener_id, storyteller_id, status, reason, shared, source, created_at, decided_at, decided_by)
     VALUES (:id, :listener, :storyteller, 'approved', :reason, '[]', 'coordinator', :now, :now, :by)
     ON CONFLICT (listener_id, storyteller_id) DO UPDATE SET
       status = 'approved', decided_at = :now, decided_by = :by,
       reason = CASE WHEN :reason != '' THEN :reason ELSE reason END`,
  ).run({ id: crypto.randomUUID(), listener: listenerId, storyteller: storytellerId, reason, now: now(), by: coordinatorId });
}

export function getMatch(id: string): Match | null {
  const row = db.prepare("SELECT * FROM matches WHERE id = ?").get(id) as MatchRow | undefined;
  return row ? toMatch(row) : null;
}

export function listMatches(filter: { status?: MatchStatus; listenerId?: string; storytellerId?: string } = {}): Match[] {
  const where: string[] = [];
  const params: Record<string, SQLInputValue> = {};
  if (filter.status) {
    where.push("status = :status");
    params.status = filter.status;
  }
  if (filter.listenerId) {
    where.push("listener_id = :listener");
    params.listener = filter.listenerId;
  }
  if (filter.storytellerId) {
    where.push("storyteller_id = :storyteller");
    params.storyteller = filter.storytellerId;
  }
  const sql = `SELECT * FROM matches ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`;
  return (db.prepare(sql).all(params) as MatchRow[]).map(toMatch);
}

export function decideMatch(id: string, status: MatchStatus, coordinatorId: string) {
  db.prepare("UPDATE matches SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?").run(status, now(), coordinatorId, id);
}

/** The pairing a coordinator approved between these two people (in either order), if any. */
export function approvedMatchBetween(a: string, b: string): Match | null {
  const row = db
    .prepare(
      `SELECT * FROM matches WHERE status = 'approved'
       AND ((listener_id = :a AND storyteller_id = :b) OR (listener_id = :b AND storyteller_id = :a))
       LIMIT 1`,
    )
    .get({ a, b }) as MatchRow | undefined;
  return row ? toMatch(row) : null;
}
