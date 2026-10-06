# Life Stories

A video platform, run on your own computer (localhost), where older adults record their life
stories with a friendly voice AI interviewer. The screens are deliberately simple: large text,
big buttons, one task per screen.

The interviewer asks a question out loud, listens to the answer, waits for a natural pause, and
asks a follow-up about what was just said. The webcam video, the storyteller's voice and the
interviewer's voice are recorded together into one video, which the storyteller can share.

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

1. **"I'm new here"** creates a profile, one question per screen: name, picture, birth year,
   hometown, work, interests, and a 4-digit PIN. The interviewer uses these details to ask
   better questions.
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
4. **My profile** lets you change your picture and details, and the interviewer's **voice**
   (5 to choose from), **speaking speed**, and **how long it waits** when you pause
   (2, 3½ or 6 seconds).
5. **Text size** (A / A+ / A++) is at the top of every page.

Recordings are uploaded every few seconds while you talk. If the window is closed or the computer
crashes mid-interview, the story is still saved, up to the last few seconds.

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
- **Summaries and tags** written after each recording will be used to match storytellers with
  young listeners who share their interests.

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
| `src/lib/db.ts` | SQLite database (`data/life-stories.db`) |
| `src/lib/recovery.ts` | Saves recordings that were cut off by a closed window or crash |

### Checks

```bash
npx tsc --noEmit   # type check
npm run lint       # lint
```

---

## Not built yet

- **The young-listener side:** listener profiles, and the AI pairing young people with
  storytellers by shared interests (the story tags are collected for this already).
- **PIN reset**, and limiting wrong PIN attempts. Fine for a family computer, not for the internet.
- **Hosting it online.** It's intentionally localhost-only for now.
