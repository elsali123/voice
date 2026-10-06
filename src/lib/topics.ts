export interface Topic {
  id: string;
  label: string;
  hint: string;
  emoji: string;
  /** What the interviewer should explore, written for the AI prompt. */
  focus: string;
}

export const TOPICS: Topic[] = [
  {
    id: "childhood",
    label: "Growing up",
    hint: "Home, family, school and games",
    emoji: "🏡",
    focus:
      "their childhood: the house and neighborhood they grew up in, parents and siblings, school, chores, games, food and holidays",
  },
  {
    id: "family",
    label: "Family and love",
    hint: "Meeting your partner, children, traditions",
    emoji: "❤️",
    focus:
      "love and family: how they met a partner, getting married, raising children, family traditions and the people they love most",
  },
  {
    id: "work",
    label: "Work and career",
    hint: "First jobs and proudest moments",
    emoji: "🧰",
    focus:
      "their working life: first jobs, their career or life's work, colleagues, proudest accomplishments and what work taught them",
  },
  {
    id: "history",
    label: "Times I lived through",
    hint: "Big events and how life has changed",
    emoji: "📻",
    focus:
      "historic events they lived through, where they were when big news happened, and how everyday life, technology and their community changed over the years",
  },
  {
    id: "lessons",
    label: "Hard times and lessons",
    hint: "Challenges and what they taught you",
    emoji: "🌦️",
    focus:
      "difficult times they faced, how they got through them, who helped them, and what they learned. Be especially gentle and patient",
  },
  {
    id: "advice",
    label: "Advice for young people",
    hint: "Wisdom to pass on",
    emoji: "💡",
    focus:
      "the wisdom they would pass on to young people today: about love, work, money, friendship, happiness, and things they would do differently",
  },
  {
    id: "any",
    label: "You choose for me",
    hint: "The interviewer picks",
    emoji: "✨",
    focus:
      "any part of their life. Start with something easy and pleasant, such as where they grew up, then follow whatever they seem most excited to talk about",
  },
];

export function topicById(id: string): Topic {
  return TOPICS.find((t) => t.id === id) ?? TOPICS[TOPICS.length - 1];
}
