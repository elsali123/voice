// Types shared by the server and the browser.

export type Role = "storyteller" | "listener";

export type PauseWait = "short" | "medium" | "long";

export interface UserSettings {
  /** Kokoro voice id, e.g. "af_heart". */
  voice: string;
  /** Speaking speed, 1 = normal. */
  speed: number;
  /** How long the interviewer waits in silence before it decides an answer is finished. */
  pauseWait: PauseWait;
}

export interface User {
  id: string;
  name: string;
  role: Role;
  birthYear: number | null;
  hometown: string;
  work: string;
  interests: string;
  about: string;
  /** 0 means no photo; bumped every time the photo changes (cache-busting). */
  photoVersion: number;
  settings: UserSettings;
  createdAt: string;
}

export type PublicUser = Pick<User, "id" | "name" | "photoVersion">;

/** A phrase recognised by speech-to-text, timed against the recording (seconds). */
export interface Segment {
  t0: number;
  t1: number;
  text: string;
}

/** One question or one answer in a recorded interview, timed against the video (seconds). */
export interface StoryEvent {
  kind: "question" | "answer";
  t: number;
  end: number;
  text: string;
  segments?: Segment[];
}

export type StoryStatus = "recording" | "processing" | "ready";
export type Visibility = "everyone" | "private";

export interface Story {
  id: string;
  userId: string;
  topic: string;
  title: string;
  summary: string;
  tags: string[];
  events: StoryEvent[];
  status: StoryStatus;
  visibility: Visibility;
  durationSec: number;
  hasThumb: boolean;
  createdAt: string;
  author: PublicUser;
}

export interface HistoryItem {
  role: "interviewer" | "storyteller";
  text: string;
}

export type InterviewAction = "start" | "answer" | "skip" | "unheard" | "wrap";
