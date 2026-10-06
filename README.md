# Life Stories

A video platform, run on your own computer (localhost), where older adults record their life
stories with a friendly voice AI interviewer, and young people are paired with them to listen and
learn. The screens are deliberately simple: large text, big buttons, one task per screen.

There are three kinds of people:

- **Storytellers** (older adults) record their life stories. The interviewer asks a question out
  loud, listens, waits for a natural pause, and asks a follow-up about what was just said. The
  webcam video and both voices are recorded together into one video.
- **Listeners** (high school and college students, volunteers, grandchildren, anyone, including
  under 18) watch stories and get paired with storytellers who share their interests.
- **Coordinators** approve every pairing. An AI matching agent suggests pairs; nothing is shared
  between a listener and a storyteller until a coordinator approves.

Everything runs locally and the default setup is free: no accounts and no paid APIs.

---

## 1. What you need

| | Why | How to get it |
|---|---|---|
| **A Mac** (Apple silicon recommended) | Tested on an M3 with 24 GB of memory. Other systems should work but are untested. | |
| **Node.js 22.13 or newer** | Runs the app. Its built-in SQLite database needs 22.13+. | [nodejs.org](https://nodejs.org) or `brew install node` |
| **Google Chrome** | Chrome's free speech recognition lets the interviewer follow what's said. | [google.com/chrome](https://www.google.com/chrome/) |
| **A webcam and microphone** | To record the video. A laptop's built-in ones are fine. | |
| **Ollama** | Runs the free AI interviewer on your computer. | [ollama.com/download](https://ollama.com/download) |
| **ffmpeg** (recommended) | Fixes up recorded videos so the player can skip around in them. Without it, videos still play but seeking may not work. | `brew install ffmpeg` |
| **Internet** | Needed once to download the voice model (~160 MB), and while recording for Chrome's speech recognition. | |

Check your versions:

```bash
node -v       # v22.13.0 or newer
ffmpeg -version
ollama --version
```

## 2. Set up the AI interviewer (Ollama)

1. Install and open the Ollama app. It runs in the menu bar.
2. Download the model (about 4.7 GB, one time):

   ```bash
   ollama pull llama3:8b
   ```

3. **Check that Ollama uses your graphics chip (GPU).** Run a quick prompt, then check:

   ```bash
   ollama run llama3:8b "Say hello"
   ollama ps
   ```

   The `PROCESSOR` column should say **`100% GPU`**. If it says **`100% CPU`**, quit Ollama from
   the menu bar and open it again, then check once more. Ollama sometimes falls back to the CPU at
   startup, and on the CPU the interviewer is several times slower: in testing, storytellers
   waited 20 seconds or more after each answer.

## 3. Install the app

```bash
cd voice            # this folder
npm install
cp .env.example .env.local
```

`.env.local` holds your settings. The defaults use Ollama with `llama3:8b` and work as they are.
To use a different AI, see [Choosing an AI provider](#choosing-an-ai-provider).

**Set a coordinator code.** Open `.env.local` and set `COORDINATOR_CODE` to a code only your
coordinators know, for example:

```bash
COORDINATOR_CODE=choose-something-private
```

Coordinators type this code when they sign up. If it's empty, nobody can sign up as a coordinator.

## 4. Run it

```bash
npm run dev
```

Open **http://localhost:3000** in **Google Chrome**.

The first time:

- Chrome asks to use your **camera and microphone**. Choose **Allow**.
- The interviewer's voice model (~160 MB) downloads in the background, and the AI model loads
  into memory. The setup screen shows "Getting ready…" for up to a minute. Later starts are
  quick. (The voice model is kept inside `node_modules/`, so it downloads again if you delete
  that folder.)

To stop the app, press `Ctrl+C` in the terminal.

## 5. Using it

Everyone starts with **"I'm new here"** on the home screen and picks who they are. After that,
they sign in by tapping their picture and entering their 4-digit PIN.

### Storytellers

1. **Sign up**, one question per screen: name, picture, birth year, hometown, work, interests,
   PIN. The interviewer uses these details to ask better questions.
2. **Record a story**:
   - **Step 1, sound check:** see yourself, say hello, hear a test sound.
   - **Step 2, pick a topic:** Growing up, Family and love, Work and career, Times I lived
     through, Hard times and lessons, Advice for young people, or "You choose for me".
   - **Step 3, the interview:** just talk. When you pause, the interviewer goes on. The buttons:
     - **I'm done answering**: the interviewer replies now, without waiting for a pause.
     - **Repeat the question**.
     - **Ask me something else**: skips to a different question.
     - **Pause**: pauses the recording.
     - **Finish & save my story**: the interviewer says goodbye, then the story is saved.
3. After saving, the AI writes a **title, short summary and topic tags**. The story page has the
   video, large captions, and a list of the questions; tap one to jump there.
4. **Home** shows "Young people listening to your stories" once a coordinator approves a pairing.
5. **My profile** lets you change your picture and details, and the interviewer's **voice**
   (5 to choose from), **speaking speed**, and **how long it waits** when you pause
   (2, 3½ or 6 seconds).

Recordings are uploaded every few seconds while you talk. If the window is closed or the computer
crashes mid-interview, the story is still saved, up to the last few seconds.

### Listeners

1. **Sign up:** name, picture, age group, who you are (high school student, college student,
   volunteer, grandchild…), interests, what you'd love to learn from an older person, and
   (optionally) someone you'd like to be paired with, like a grandparent.
2. The **matching agent** immediately suggests storytellers for you, and a coordinator reviews them.
3. **Home** shows **Your storytellers** once a pairing is approved (with the reason you were
   paired), **Stories you might like** based on your interests, and **All stories**.

### Coordinators

1. **Sign up:** choose "I'm a program coordinator" and enter the coordinator code.
2. **Pairings** (`/coordinator`) shows:
   - **Waiting for your approval:** each suggestion shows the listener and the storyteller side
     by side, what they have in common, and why the agent suggested them. Listeners under 18 are
     clearly marked. **Approve pairing** or **Decline**.
   - **Approved pairings**, each with **End pairing**.
   - **Find new matches:** asks the agent to look again for every listener, for example after
     new storytellers join or record stories. It runs in the background; with Ollama on the CPU it
     can take a minute per listener.
   - **Pair two people yourself:** for pairs you already know, like a grandchild and grandparent.
   - **Declined or ended** pairings, which can be approved after all.

### Text size

**Text size** (A / A+ / A++) is at the top of every page.

---

## Choosing an AI provider

Set `AI_PROVIDER` in `.env.local`, then restart `npm run dev`.

| `AI_PROVIDER` | Cost | Privacy | Setup |
|---|---|---|---|
| `ollama` (default) | Free, no limits | Stories never leave your computer | Steps in section 2. Change the model with `OLLAMA_MODEL`. |
| `groq` | Free tier (rate-limited) | Sent to Groq's cloud | Get a key at [console.groq.com](https://console.groq.com) and set `GROQ_API_KEY`. Very fast. |
| `gemini` | Free tier (rate-limited) | Sent to Google's cloud; free-tier prompts may be used to improve Google's products | Get a key at [aistudio.google.com](https://aistudio.google.com) and set `GEMINI_API_KEY`. |
| `anthropic` | Paid | Sent to Anthropic's cloud | Set `ANTHROPIC_API_KEY`. Uses Claude (`ANTHROPIC_MODEL`). |
| `scripted` | Free | Local | No AI: the interviewer uses a built-in list of good questions. |

Model names for each provider can be changed in `.env.local`. Free-tier models and limits
change over time, so check the provider's website if a model stops working.

If the AI can't be reached for any reason, the interviewer automatically uses the built-in
questions instead, so an interview never stops halfway.

### Privacy at a glance

- **Pairings need a coordinator's approval.** The matching agent only makes suggestions.
- **Listener profiles** can be seen only by the listener, coordinators, and storytellers they're
  paired with. Storytellers see listeners under 18 by first name only.
- **Videos, photos and transcripts** are stored only in the `data/` folder on your computer.
- **Speech recognition** uses Chrome's built-in service, which sends the microphone audio to
  Google to turn it into text.
- **The interviewer's voice** (Kokoro) runs entirely on your computer.
- **The AI interviewer** runs on your computer with Ollama, or in the cloud if you choose a
  cloud provider above.

---

## Troubleshooting

| Problem | What to do |
|---|---|
| Long silence (20+ seconds) before the interviewer replies | Ollama is on the CPU. Run `ollama ps`; if it says `CPU`, quit and reopen Ollama (section 2, step 3). Or switch to `groq`. |
| Setup says "Ollama isn't running" | Open the Ollama app. |
| Setup says the model "isn't downloaded" | Run `ollama pull llama3:8b` (or whatever `OLLAMA_MODEL` is set to). |
| "We need permission to use your camera and microphone" | Click the camera icon in Chrome's address bar, choose **Allow**, then **Try again**. Also check **System Settings → Privacy & Security → Camera / Microphone** for Chrome. |
| The interviewer doesn't react to what was said / no live words appear | Use Google Chrome, and check the internet connection; Chrome's speech recognition needs it. |
| The voice sounds robotic | The natural voice couldn't load, so the computer's own voice is used. Check the internet connection on first run (the voice model downloads once), then restart `npm run dev`. |
| Can't skip around in a video | Install ffmpeg (`brew install ffmpeg`). This applies to stories recorded after installing it. |
| `Port 3000 is in use` | Another copy is running. Close it, or run `npm run dev -- -p 3001` and open http://localhost:3001. |
| Start over with no profiles or stories | Stop the app and delete the `data/` folder. |
| Forgot a PIN | There's no reset screen yet. Delete `data/` to start over. |
| "Coordinator sign-up is turned off" | Set `COORDINATOR_CODE` in `.env.local` (section 3). |
| The matching agent found no suggestions | It only suggests people with something real in common. Add more interests to the listener's profile, wait for storytellers to record stories (their story tags help), or pair them yourself. |

---

## How it works

```
 microphone ──► Chrome speech recognition ──► words
                                                │   waits for a pause (or "I'm done answering")
                                                ▼
                      AI interviewer writes the next question
                      (streamed sentence by sentence when the AI runs on a GPU)
                                                ▼
           Kokoro voice (on this computer) ──► speakers + the recording
```

- **Recording:** in the browser, the webcam, the microphone and the interviewer's voice are
  mixed into one WebM video with `MediaRecorder` and uploaded in 4-second pieces. When the
  story is finished, ffmpeg rewrites the file so it can be seeked (no re-encoding).
- **The interviewer's instructions** (`src/lib/interviewer.ts`) ask for warm, short replies:
  one sentence reacting to a detail of the last answer, then one open question about a concrete
  memory. It gets gentle with painful subjects and checks in every 15 minutes.
- **Speed tricks:** the AI reads each storyteller's instructions during the sound check, so the
  first question comes sooner. The voice starts speaking the first sentence while the rest is
  still being written. The voice runs on its own thread so the server stays responsive.
- **The matching agent** (`src/lib/matching.ts`) reads each listener's interests and goals, and
  each storyteller's profile, story titles, summaries and tags. It shortlists storytellers by
  shared words, then the AI picks up to 3 and explains why. Small local models sometimes mix
  people up, so every AI pick must quote the detail it relied on, and the app checks that the
  detail really belongs to that storyteller; picks it can't back up are dropped. Anyone a
  listener asked for by name is always suggested. Without AI, it matches on shared words alone.
  Pairs that were already suggested, approved or declined are never suggested again.

### Project layout

| Path | What's there |
|---|---|
| `src/lib/interviewer.ts` | Interviewer instructions, streaming replies, built-in questions, story summaries |
| `src/lib/ai.ts` | The AI providers (Ollama, Groq, Gemini, Claude) |
| `src/lib/tts.ts`, `workers/tts-worker.mjs` | The Kokoro voice, running in a worker thread |
| `src/lib/client/interview-session.ts` | The in-browser interview loop: listening, pause detection, recording, uploads |
| `src/lib/client/recognizer.ts` | Chrome speech recognition wrapper |
| `src/lib/client/voice-player.ts` | Plays the voice sentence by sentence (falls back to the browser's voice) |
| `src/components/Studio.tsx` | The recording studio screens |
| `src/app/` | Pages (home, join, record, story, person, profile) and API routes (`src/app/api/`) |
| `src/lib/matching.ts`, `src/lib/keywords.ts` | The matching agent and shared-interest scoring |
| `src/lib/roles.ts` | Storyteller / listener / coordinator details and the under-18 rules |
| `src/components/CoordinatorBoard.tsx` | The coordinator's pairings screen |
| `src/lib/db.ts` | SQLite database (`data/life-stories.db`), including pairings |
| `src/lib/recovery.ts` | Saves recordings that were cut off by a closed window or crash |

### Checks

```bash
npx tsc --noEmit   # type check
npm run lint       # lint
```

---

## Not built yet

- **What happens after a pairing:** messages, thank-you notes or live calls between a listener
  and a storyteller. For now a pairing lets each see the other, and puts the storyteller's stories
  first for the listener.
- **Parent or guardian consent** for listeners under 18 (they're flagged to coordinators today).
- **Notifications** when a pairing is approved.
- **PIN reset**, and limiting wrong PIN attempts. Fine for a family computer, not for the internet.
- **Hosting it online.** It's intentionally localhost-only for now.
