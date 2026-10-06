import { brainInfo, chat, chatStream, localModelOnCpu, type Turn } from "./ai";
import { listStoriesByUser } from "./db";
import { sentenceEnd, splitSentences } from "./sentences";
import { topicById, type Topic } from "./topics";
import { firstName } from "./voices";
import type { HistoryItem, InterviewAction, StoryEvent, User } from "./types";

export interface InterviewContext {
  user: User;
  topicId: string;
  history: HistoryItem[];
  action: InterviewAction;
  elapsedSec: number;
  /** True once every ~15 minutes: ask whether they'd like to keep going. */
  checkIn: boolean;
  priorStories: { title: string; summary: string }[];
}

/** Summaries of the storyteller's earlier stories, so the interviewer doesn't repeat them. */
export function priorStoriesFor(userId: string): InterviewContext["priorStories"] {
  return listStoriesByUser(userId, userId)
    .filter((s) => s.status === "ready" && s.summary)
    .slice(0, 5)
    .map((s) => ({ title: s.title, summary: s.summary }));
}

/**
 * Has a local model read the (long, per-person) instructions ahead of time. Ollama keeps that work
 * cached, so the first question comes much sooner. Runs while the person does the sound check.
 */
export async function primeInterviewer(user: User): Promise<void> {
  if (brainInfo().provider !== "ollama") return;
  await chat(systemPrompt(user, priorStoriesFor(user.id)), [{ role: "user", content: "[Reply with only the word: ready]" }], { maxTokens: 1 });
}

const MAX_SENTENCES = 4;

/**
 * The interviewer's next line, one sentence at a time as the AI writes it, so the voice can start
 * speaking right away. Falls back to built-in questions if the AI is unavailable.
 */
export async function* nextLine(c: InterviewContext): AsyncGenerator<string> {
  if (brainInfo().provider !== "scripted") {
    // A local model on the CPU shares it with the voice; speaking while still writing would slow
    // both to a crawl, so then the whole reply is sent at once.
    const stream = !(await localModelOnCpu());
    const held: string[] = [];
    let said = 0;
    try {
      for await (const sentence of aiSentences(c)) {
        said++;
        if (stream) yield sentence;
        else held.push(sentence);
      }
    } catch (err) {
      console.error("[interviewer] AI unavailable, using a built-in question:", (err as Error).message);
    }
    yield* held;
    if (said) return;
    console.warn("[interviewer] no AI reply, using a built-in question");
  }
  yield* splitSentences(scriptedLine(c));
}

async function* aiSentences(c: InterviewContext): AsyncGenerator<string> {
  let buffer = "";
  let said = 0;
  for await (const piece of chatStream(systemPrompt(c.user, c.priorStories), buildTurns(c), { maxTokens: 160 })) {
    // Hidden reasoning from "thinking" models is dropped once complete, and waited out until then.
    buffer = (buffer + piece).replace(/<think>[\s\S]*?<\/think>/gi, "");
    if (/<think>/i.test(buffer)) continue;
    for (let end = sentenceEnd(buffer); end > 0; end = sentenceEnd(buffer)) {
      const sentence = cleanSpoken(buffer.slice(0, end));
      buffer = buffer.slice(end);
      if (!sentence) continue;
      yield sentence;
      if (++said >= MAX_SENTENCES) return; // rambling: stop generating
    }
  }
  const last = cleanSpoken(buffer);
  if (last) yield last;
}

// Keep this identical for every turn of an interview (and free of the topic), so local models can
// reuse their cached work on it. The topic goes in the first message instead.
function systemPrompt(u: User, priorStories: InterviewContext["priorStories"]): string {
  const first = firstName(u.name);
  const facts = [
    `Name: ${u.name} (call them ${first})`,
    u.birthYear && `Born: ${u.birthYear} (about ${new Date().getFullYear() - u.birthYear} years old)`,
    u.hometown && `Grew up in: ${u.hometown}`,
    u.work && `Work: ${u.work}`,
    u.interests && `Enjoys: ${u.interests}`,
    u.about && `In their own words: ${u.about}`,
  ]
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
  const prior = priorStories.length
    ? `\n\nStories ${first} has already recorded (don't repeat these, but you may build on them):\n` +
      priorStories.map((s) => `- ${s.title}: ${s.summary}`).join("\n")
    : "";

  return `You are a warm, patient interviewer helping ${first}, an older adult, record their life story on video for their family and for young people who want to learn from them. You are like a kind, curious grandchild with the skill of an oral historian.

About ${first}:
${facts}${prior}

How to speak (a voice reads your words aloud):
- Reply with only the exact words you will say. No stage directions, emojis, lists, quotation marks or labels like "Interviewer:".
- Keep every reply under 30 words: one short sentence reacting, then one short question. Use plain, friendly words.
- Each reply: one short, specific reaction that uses a detail from ${first}'s most recent answer, then exactly ONE question that follows on from that answer.
- Ask open questions about concrete memories: people, places, sounds, smells, what an ordinary day looked like, how something felt.
- Follow up on interesting details before changing subject. After two or three questions about one memory, gently move to another part of the topic.
- Never ask two questions at once, and never offer choices like "was it this, or that?". Never give advice, lecture, correct them or talk about yourself.
- If they mention something painful, acknowledge it kindly and let them choose whether to say more or move on.
- If an answer is short or they seem unsure, ask an easier, more specific question.
- Their words come from automatic speech recognition, so punctuation may be missing and some words may be wrong. Work out what they meant and never mention transcription mistakes.

Good reply: That picture of milking cows with your dad before school is wonderful. What did the barn sound and smell like on those cold mornings?
Bad reply: That sounds lovely! What is your favorite memory?`;
}

const MAX_RECENT_TURNS = 16;

function buildTurns(c: InterviewContext): Turn[] {
  const first = firstName(c.user.name);
  const topic = topicById(c.topicId);
  const turns: Turn[] = [
    {
      role: "user",
      content: `[Today's topic: ${topic.label}. Explore ${topic.focus}.]\n[The recording has started. Greet ${first} warmly by name in one short sentence, then ask your first easy question about the topic.]`,
    },
  ];

  // Long interviews: keep the recent conversation verbatim and only brief notes of earlier answers.
  const older = c.history.slice(0, Math.max(0, c.history.length - MAX_RECENT_TURNS));
  const recent = c.history.slice(older.length);
  const notes = older
    .filter((h) => h.role === "storyteller")
    .map((h) => `- ${h.text.split(/\s+/).slice(0, 30).join(" ")}…`);
  if (notes.length) turns.push({ role: "user", content: `[Earlier in this interview ${first} talked about:\n${notes.join("\n")}]` });

  for (const h of recent) turns.push({ role: h.role === "interviewer" ? "assistant" : "user", content: h.text });

  const note = actionNote(c, first, topicById(c.topicId));
  if (note) turns.push({ role: "user", content: note });
  return turns;
}

function actionNote(c: InterviewContext, first: string, topic: Topic): string | null {
  switch (c.action) {
    case "start":
      return null;
    case "answer":
      return c.checkIn
        ? `[You have been talking for about ${Math.round(c.elapsedSec / 60)} minutes. React to what ${first} said, then kindly ask whether they'd like to keep going or stop for today, and mention they can tap the Finish button any time.]`
        : null;
    case "skip":
      return `[${first} tapped "Ask me something else". Say "Of course" or similar, then ask a different question about ${topic.label.toLowerCase()}.]`;
    case "unheard":
      return `[You didn't catch ${first}'s answer. Kindly say you didn't quite hear that, and ask your last question again in simpler words.]`;
    case "wrap":
      return `[${first} tapped "Finish". Thank them warmly by name, mention one specific thing from today that you loved hearing, and say goodbye. Do not ask any question.]`;
  }
}

/** Removes things a voice shouldn't read aloud: hidden reasoning, *actions*, labels, emojis, markdown. */
export function cleanSpoken(raw: string): string {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, " ");
  s = s.replace(/^\s*(here'?s|here is) (my|the) (response|reply)[^:\n]*:\s*/i, "");
  s = s.replace(/^\s*(interviewer|assistant)\s*:\s*/i, "");
  s = s.replace(/\*[^*]{0,80}\*/g, " ");
  s = s.replace(/\[[^\]]{0,120}\]/g, " ");
  s = s.replace(/\((?:[^)]{0,40})(pause|smile|laugh|warm|gentl|soft|nod)(?:[^)]{0,40})\)/gi, " ");
  s = s.replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, "");
  s = s.replace(/[#_`>|]/g, " ").replace(/\s+/g, " ").trim();
  return s.replace(/^["“”']+|["“”']+$/g, "").trim();
}

// ---------- built-in questions (used when no AI is available) ----------

const QUESTIONS: Record<string, string[]> = {
  childhood: [
    "Where did you grow up, and what was your home like?",
    "Who lived in your house when you were a child?",
    "What was a normal day like for you when you were about ten years old?",
    "What games did you play, and who did you play with?",
    "What do you remember about your school and your teachers?",
    "What was your favorite meal growing up, and who made it?",
    "How did your family celebrate holidays or birthdays?",
  ],
  family: [
    "How did you meet the love of your life?",
    "What do you remember about your wedding day, or another big family day?",
    "What was it like when your first child was born?",
    "What family traditions are most special to you?",
    "Who in your family are you most like, and why?",
    "What do you hope your family remembers about you?",
  ],
  work: [
    "What was your very first job, and how old were you?",
    "What kind of work did you do for most of your life?",
    "Who was the best boss or colleague you ever had?",
    "What are you proudest of from your working life?",
    "What was the hardest day you ever had at work?",
    "What did your work teach you about people?",
  ],
  history: [
    "What is the earliest big news event you remember?",
    "Where were you when you heard some of the biggest news of your lifetime?",
    "How has your hometown changed since you were young?",
    "What invention changed your everyday life the most?",
    "What did things cost when you were young?",
    "What do you miss most about the old days?",
  ],
  lessons: [
    "What was one of the hardest times in your life?",
    "Who helped you get through difficult times?",
    "What gave you strength when things were tough?",
    "Is there a mistake you made that taught you something important?",
    "How did hard times change you as a person?",
  ],
  advice: [
    "What is the best advice anyone ever gave you?",
    "What do you know now that you wish you had known at twenty?",
    "What makes a good friendship last?",
    "What advice would you give a young person about love?",
    "What advice would you give a young person about work and money?",
    "What has made you happiest in life?",
  ],
  any: [
    "Where did you grow up, and what was your home like?",
    "What was your very first job?",
    "How did you meet the love of your life?",
    "What are you proudest of in your life?",
    "What is the best advice anyone ever gave you?",
    "What has made you happiest in life?",
  ],
};

const GENERIC_FOLLOW_UPS = [
  "That's wonderful. Can you tell me a little more about that?",
  "What do you remember most about that time?",
  "How did that make you feel back then?",
  "Who else was part of that memory?",
];

const PEOPLE = ["mother", "father", "mom", "dad", "brother", "sister", "grandmother", "grandfather", "grandma", "grandpa", "husband", "wife", "teacher", "aunt", "uncle", "son", "daughter", "best friend"];
const PLACES = ["farm", "school", "church", "city", "town", "house", "kitchen", "store", "shop", "army", "navy", "war", "factory", "office", "hospital", "beach", "lake", "garden", "village"];

function followUp(answer: string, n: number): string {
  const lower = answer.toLowerCase();
  const person = PEOPLE.find((p) => new RegExp(`\\b${p}\\b`).test(lower));
  if (person) return `You mentioned your ${person}. What was your ${person} like as a person?`;
  const place = PLACES.find((p) => new RegExp(`\\b${p}\\b`).test(lower));
  if (place) return `Tell me more about the ${place}. What do you remember seeing and hearing there?`;
  return GENERIC_FOLLOW_UPS[n % GENERIC_FOLLOW_UPS.length];
}

function scriptedLine(c: InterviewContext): string {
  const first = firstName(c.user.name);
  const topic = topicById(c.topicId);
  const questions = QUESTIONS[topic.id] ?? QUESTIONS.any;
  const asked = c.history.filter((h) => h.role === "interviewer").map((h) => h.text);
  const lastAsked = asked[asked.length - 1] ?? "";
  const lastAnswer = [...c.history].reverse().find((h) => h.role === "storyteller")?.text ?? "";
  const isMain = (line: string) => questions.some((q) => line.includes(q));

  switch (c.action) {
    case "wrap":
      return `Thank you so much, ${first}. It has been a real joy hearing your stories today. Your family and the young people who watch this will treasure them. Goodbye for now.`;
    case "start":
      return `Hello ${first}, it's so nice to meet you. Today I'd love to hear about ${topic.label.toLowerCase()}. ${questions[0]}`;
    case "unheard":
      return "I'm sorry, I didn't quite catch that. Could you tell me again?";
  }

  if (c.action === "answer" && isMain(lastAsked) && lastAnswer.split(/\s+/).length >= 8) {
    return followUp(lastAnswer, asked.length);
  }
  const next = questions.find((q) => !asked.some((a) => a.includes(q)));
  if (!next) {
    return `You've shared so much today, ${first}. Is there anything else about ${topic.label.toLowerCase()} you'd like to tell me? Whenever you're ready, you can tap Finish.`;
  }
  const lead = c.action === "skip" ? "Of course. " : ["Thank you for sharing that. ", "I love hearing that. ", "How wonderful. "][asked.length % 3];
  return lead + next;
}

// ---------- after the recording ----------

export interface StorySummary {
  title: string;
  summary: string;
  tags: string[];
}

/** Writes a title, short summary and interest tags (used later to match young listeners). */
export async function summarizeStory(user: User, topicId: string, events: StoryEvent[]): Promise<StorySummary> {
  const first = firstName(user.name);
  const topic = topicById(topicId);
  const fallback: StorySummary = { title: `${first}: ${topic.label}`, summary: `${first} talks about ${topic.label.toLowerCase()}.`, tags: [] };

  const answers = events.filter((e) => e.kind === "answer" && e.text.split(/\s+/).length > 3);
  if (!answers.length || brainInfo().provider === "scripted") return fallback;

  // Keep the prompt comfortably inside a small local model's context window.
  const perAnswer = Math.max(60, Math.floor(2500 / answers.length));
  const transcript = events
    .filter((e) => e.text.trim())
    .map((e) =>
      e.kind === "question"
        ? `Interviewer: ${e.text}`
        : `${first}: ${e.text.split(/\s+/).slice(0, perAnswer).join(" ")}`,
    )
    .join("\n");

  const facts = [user.birthYear && `born ${user.birthYear}`, user.hometown && `grew up in ${user.hometown}`, user.work && `worked as ${user.work}`]
    .filter(Boolean)
    .join(", ");

  try {
    const raw = await chat(
      "You write short, warm, accurate descriptions of recorded life-story interviews. You only use facts from the transcript.",
      [
        {
          role: "user",
          content: `Storyteller: ${user.name}${facts ? ` (${facts})` : ""}. Topic: ${topic.label}.

Transcript (from speech recognition, so some words may be wrong):
${transcript}

Return only a JSON object with these keys:
"title": 3 to 8 words, specific and inviting, for example "Milking Cows Before School in Ohio".
"summary": 2 or 3 warm sentences in the third person, using ${first}'s name. Mention the most vivid specific details ${first} shared (people, places, events). No generic filler like "full of joy and tradition".
"tags": 3 to 8 short lowercase tags, plain words with spaces, for places, decades, jobs, hobbies and life events (for example "dairy farm", "1950s", "sledding"). They are used to match ${first} with young listeners who share those interests.`,
        },
      ],
      { maxTokens: 500, json: true },
    );
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    const parsed = json ? (JSON.parse(json) as Partial<Record<keyof StorySummary, unknown>>) : {};
    const title = typeof parsed.title === "string" ? parsed.title.trim().replace(/^["']|["']$/g, "").slice(0, 90) : "";
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 700) : "";
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags
          .map((t) => String(t).toLowerCase().replace(/[_#]/g, " ").replace(/\s+/g, " ").trim())
          .filter((t, i, all) => t && t.length < 40 && all.indexOf(t) === i)
          .slice(0, 8)
      : [];
    return { title: title || fallback.title, summary: summary || fallback.summary, tags };
  } catch (err) {
    console.error("[summary] failed:", (err as Error).message);
    return fallback;
  }
}
