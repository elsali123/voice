import Anthropic from "@anthropic-ai/sdk";

/**
 * One small interface over the AI providers the interviewer can use. Pick one with
 * AI_PROVIDER in .env.local. Ollama (the default) is free and keeps every story on
 * this computer.
 */

export type Turn = { role: "user" | "assistant"; content: string };
export type Provider = "ollama" | "groq" | "gemini" | "anthropic" | "scripted";

export interface BrainInfo {
  provider: Provider;
  model: string;
  label: string;
  free: boolean;
  private: boolean;
}

const env = (key: string, fallback = "") => process.env[key]?.trim() || fallback;
const ollamaUrl = () => env("OLLAMA_URL", "http://localhost:11434").replace(/\/$/, "");
// Long interviews would otherwise push the system prompt out of a small default window.
// Every Ollama call must use the same value: a different one makes Ollama reload the model.
const OLLAMA_CONTEXT = 8192;

export function brainInfo(): BrainInfo {
  switch (env("AI_PROVIDER", "ollama").toLowerCase()) {
    case "groq":
      return { provider: "groq", model: env("GROQ_MODEL", "llama-3.3-70b-versatile"), label: "Groq (free tier, cloud)", free: true, private: false };
    case "gemini":
      return { provider: "gemini", model: env("GEMINI_MODEL", "gemini-2.5-flash"), label: "Google Gemini (free tier, cloud)", free: true, private: false };
    case "anthropic":
      return { provider: "anthropic", model: env("ANTHROPIC_MODEL", "claude-opus-5-5"), label: "Claude (paid, cloud)", free: false, private: false };
    case "scripted":
      return { provider: "scripted", model: "built-in questions", label: "Built-in questions (no AI)", free: true, private: true };
    default:
      return { provider: "ollama", model: env("OLLAMA_MODEL", "llama3:8b"), label: "Ollama (free, on this computer)", free: true, private: true };
  }
}

/** Providers want alternating user/assistant turns that start with the user. */
function normalize(turns: Turn[]): Turn[] {
  const out: Turn[] = [];
  for (const t of turns) {
    const prev = out[out.length - 1];
    if (prev && prev.role === t.role) prev.content += `\n\n${t.content}`;
    else out.push({ ...t });
  }
  if (out[0]?.role !== "user") out.unshift({ role: "user", content: "[Begin.]" });
  return out;
}

export async function chat(
  system: string,
  turns: Turn[],
  opts: { maxTokens?: number; json?: boolean } = {},
): Promise<string> {
  const info = brainInfo();
  const messages = normalize(turns);
  const maxTokens = opts.maxTokens ?? 400;
  switch (info.provider) {
    case "scripted":
      throw new Error("No AI provider configured");
    case "ollama":
      return ollamaChat(info.model, system, messages, maxTokens, opts.json);
    case "groq":
      return openAICompatibleChat("https://api.groq.com/openai/v1", env("GROQ_API_KEY"), info.model, system, messages, opts.json);
    case "gemini":
      return openAICompatibleChat("https://generativelanguage.googleapis.com/v1beta/openai", env("GEMINI_API_KEY"), info.model, system, messages, opts.json);
    case "anthropic":
      return claudeChat(info.model, system, messages);
  }
}

/**
 * Like chat(), but yields the reply in pieces as it's generated, so the interviewer can start
 * speaking its first sentence while the rest is still being written. Only Ollama streams here;
 * cloud providers are fast enough that their whole reply arrives as a single piece.
 * Stopping the loop early cancels generation.
 */
export async function* chatStream(system: string, turns: Turn[], opts: { maxTokens?: number } = {}): AsyncGenerator<string> {
  const info = brainInfo();
  if (info.provider !== "ollama") {
    yield await chat(system, turns, opts);
    return;
  }
  const res = await ollamaRequest(info.model, system, normalize(turns), opts.maxTokens ?? 400, false, true);
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      pending += value;
      for (let nl = pending.indexOf("\n"); nl >= 0; nl = pending.indexOf("\n")) {
        const line = pending.slice(0, nl).trim();
        pending = pending.slice(nl + 1);
        if (!line) continue;
        const data = JSON.parse(line) as { message?: { content?: string }; error?: string };
        if (data.error) throw new Error(`Ollama: ${data.error}`);
        if (data.message?.content) yield data.message.content;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function ollamaRequest(model: string, system: string, messages: Turn[], maxTokens: number, json: boolean, stream: boolean) {
  const res = await fetch(`${ollamaUrl()}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream,
      keep_alive: "30m",
      format: json ? "json" : undefined,
      options: { temperature: 0.7, num_predict: maxTokens, num_ctx: OLLAMA_CONTEXT },
      messages: [{ role: "system", content: system }, ...messages],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  return res;
}

async function ollamaChat(model: string, system: string, messages: Turn[], maxTokens: number, json?: boolean) {
  const res = await ollamaRequest(model, system, messages, maxTokens, !!json, false);
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

async function openAICompatibleChat(baseUrl: string, apiKey: string, model: string, system: string, messages: Turn[], json?: boolean) {
  if (!apiKey) throw new Error("Missing API key for the selected AI provider");
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      // Generous: some free models "think" first and that counts against this limit.
      max_tokens: 2048,
      temperature: 0.7,
      response_format: json ? { type: "json_object" } : undefined,
      messages: [{ role: "system", content: system }, ...messages],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${baseUrl} ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

let anthropic: Anthropic | null = null;

async function claudeChat(model: string, system: string, messages: Turn[]) {
  anthropic ??= new Anthropic();
  const response = await anthropic.beta.messages.create({
    model,
    max_tokens: 4000,
    system,
    messages,
    // Interview turns are short conversational replies, so low effort keeps them quick.
    output_config: { effort: "low" },
    // If a request is declined by a safety classifier, retry it server-side on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined this request");
  return response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
}

let cpuCheck: { at: number; cpu: boolean } | null = null;

/**
 * True when Ollama is running the model on the CPU instead of the graphics chip (it falls back to
 * the CPU when its GPU check fails at startup). The model and the voice then compete for the CPU.
 */
export async function localModelOnCpu(): Promise<boolean> {
  const info = brainInfo();
  if (info.provider !== "ollama") return false;
  if (cpuCheck && Date.now() - cpuCheck.at < 60_000) return cpuCheck.cpu;
  try {
    const res = await fetch(`${ollamaUrl()}/api/ps`, { signal: AbortSignal.timeout(2000) });
    const data = (await res.json()) as { models?: { name: string; model: string; size_vram: number }[] };
    const loaded = data.models?.find((m) => m.name === info.model || m.model === info.model);
    const cpu = !!loaded && loaded.size_vram === 0;
    if (cpu && !cpuCheck?.cpu) {
      console.warn(`[ai] Ollama is running ${info.model} on the CPU, not the GPU, so replies will be slow. Quit Ollama from the menu bar and open it again.`);
    }
    cpuCheck = { at: Date.now(), cpu };
    return cpu;
  } catch {
    return false;
  }
}

/** Loads the model into memory ahead of time (a cold Ollama model can take ~40s). */
export async function warmUpBrain(): Promise<void> {
  const info = brainInfo();
  if (info.provider === "scripted") throw new Error("No AI provider configured");
  if (info.provider !== "ollama") return;
  const res = await fetch(`${ollamaUrl()}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: info.model, prompt: "", keep_alive: "30m", options: { num_ctx: OLLAMA_CONTEXT } }),
    signal: AbortSignal.timeout(180_000),
  }).catch(() => {
    throw new Error("Ollama isn't running. Open the Ollama app, then try again.");
  });
  if (res.status === 404) throw new Error(`The model "${info.model}" isn't downloaded. Run: ollama pull ${info.model}`);
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  await res.text();
}
