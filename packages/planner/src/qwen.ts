import { z } from "zod";
import { cloudQuota, QwenRateLimitError } from "./cloud-quota.js";
import { cloudModelProfiles, defaultCloudModel, isReviewedCloudModel } from "./model-profiles.js";

export const freeCloudQwenModel = "qwen/qwen3.8-27b";

export interface QwenOptions {
  provider?: "ollama" | "groq";
  baseUrl?: string;
  modelId?: string;
  apiToken?: string;
  apiKey?: string;
  freeTierConfirmed?: boolean;
  timeoutMs?: number;
  contextTokens?: number;
  outputTokens?: number;
  concurrency?: number;
  maxQueue?: number;
  fetch?: typeof globalThis.fetch;
}
export interface QwenMetrics {
  provider: "ollama" | "groq";
  modelId: string;
  elapsedMs: number;
  queueMs: number;
  loadMs: number;
  inputTokens: number;
  outputTokens: number;
  tokensPerSecond: number;
  remainingRequests?: number;
  remainingTokens?: number;
  reasoningTokens?: number;
}

/** Bound GPU work instead of spawning unlimited inference requests. */
class InferenceGate {
  private active = 0;
  private readonly waiting: { grant(): void; signal: AbortSignal; abort(): void }[] = [];
  constructor(private readonly concurrency: number, private readonly maxQueue: number) {}
  async acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) throw new Error("QWEN_TIMEOUT");
    if (this.active < this.concurrency) { this.active++; return this.release(); }
    if (this.waiting.length >= this.maxQueue) throw new Error("QWEN_QUEUE_FULL");
    return new Promise((resolve, reject) => {
      const entry = {
        signal,
        grant: () => {
          signal.removeEventListener("abort", entry.abort);
          this.active++;
          resolve(this.release());
        },
        abort: () => {
          const index = this.waiting.indexOf(entry);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(new Error("QWEN_TIMEOUT"));
        },
      };
      this.waiting.push(entry);
      signal.addEventListener("abort", entry.abort, { once: true });
    });
  }
  private release() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      let entry;
      while ((entry = this.waiting.shift())) {
        if (entry.signal.aborted) { entry.abort(); continue; }
        entry.grant();
        break;
      }
    };
  }
}

const responseSchema = z.object({
  done: z.literal(true), done_reason: z.string().optional(),
  message: z.object({ role: z.literal("assistant"), content: z.string().max(8192) }),
  load_duration: z.number().nonnegative().optional(), eval_duration: z.number().nonnegative().optional(),
  prompt_eval_count: z.number().int().nonnegative().optional(), eval_count: z.number().int().nonnegative().optional(),
});
const cloudResponseSchema = z.object({
  model: z.string(), choices: z.array(z.object({ finish_reason: z.string(), message: z.object({ content: z.string().max(8192).nullable(), refusal: z.string().nullable().optional() }) })).length(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative(), completion_tokens_details: z.object({ reasoning_tokens: z.number().int().nonnegative().optional() }).optional() }),
  x_groq: z.object({ usage: z.object({ completion_time: z.number().nonnegative().optional() }).optional() }).optional(),
});

function cloudSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloudSchema);
  if (!value || typeof value !== "object") return value;
  // Constrain structural output at the provider and enforce formats/lengths again
  // with the original Zod schema. No response ever authorizes a financial field.
  const ignored = new Set(["$schema", "format", "pattern", "minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum"]);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !ignored.has(key)).map(([key, item]) => [key, cloudSchema(item)]));
}

/** Reviewed Groq models plus explicit legacy Ollama. QwenClient is a compatibility name. */
export class QwenClient {
  readonly provider: "ollama" | "groq";
  readonly modelId: string;
  private readonly endpoint: string;
  private readonly gate: InferenceGate;
  private readonly timeoutMs: number;
  private readonly contextTokens: number;
  private readonly outputTokens: number;
  private readonly request: typeof globalThis.fetch;
  constructor(private readonly options: QwenOptions = {}) {
    this.provider = options.provider ?? "groq";
    const url = new URL(options.baseUrl ?? (this.provider === "groq" ? "https://api.groq.com/openai/v1" : "http://127.0.0.1:11434"));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("INVALID_MODEL_ENDPOINT");
    if (this.provider === "groq" && (url.toString().replace(/\/$/, "") !== "https://api.groq.com/openai/v1" || !options.apiKey || !/^gsk_[A-Za-z0-9_-]{16,}$/.test(options.apiKey))) throw new Error("QWEN_CLOUD_CONFIGURATION_REQUIRED");
    if (this.provider === "groq" && options.freeTierConfirmed !== true) throw new Error("QWEN_FREE_TIER_CONFIRMATION_REQUIRED");
    this.endpoint = `${url.toString().replace(/\/$/, "")}${this.provider === "groq" ? "/chat/completions" : "/api/chat"}`;
    this.modelId = options.modelId ?? (this.provider === "groq" ? defaultCloudModel : "qwen3:8b");
    if ((this.provider === "ollama" && !this.modelId.toLowerCase().includes("qwen")) || this.modelId.length > 120 || /[\s\r\n]/.test(this.modelId)) throw new Error("INVALID_QWEN_MODEL_ID");
    if (this.provider === "groq" && !isReviewedCloudModel(this.modelId)) throw new Error("QWEN_CLOUD_MODEL_NOT_ALLOWLISTED");
    this.timeoutMs = options.timeoutMs ?? 45000;
    this.contextTokens = options.contextTokens ?? 4096;
    const profile = isReviewedCloudModel(this.modelId) ? cloudModelProfiles[this.modelId] : undefined;
    this.outputTokens = options.outputTokens ?? (this.provider === "groq" ? profile!.defaultCompletionTokens : 256);
    const concurrency = options.concurrency ?? 1, maxQueue = options.maxQueue ?? 8;
    for (const [value, min, max] of [[this.timeoutMs, 100, 120000], [this.contextTokens, 1024, 8192], [this.outputTokens, 32, this.provider === "groq" ? profile!.maxCompletionTokens : 512], [concurrency, 1, 2], [maxQueue, 0, 32]]) {
      if (!Number.isInteger(value) || value! < min! || value! > max!) throw new Error("INVALID_QWEN_LIMITS");
    }
    this.gate = new InferenceGate(concurrency, maxQueue);
    this.request = options.fetch ?? globalThis.fetch;
  }

  async generate<T>(schema: z.ZodType<T>, system: string, prompt: string): Promise<{ value: T; metrics: QwenMetrics }> {
    const started = performance.now();
    const signal = AbortSignal.timeout(this.timeoutMs);
    const release = await this.gate.acquire(signal);
    const acquired = performance.now();
    try {
      const jsonSchema = z.toJSONSchema(schema);
      if (this.provider === "groq") return await this.generateCloud(schema, system, prompt, jsonSchema, signal, started, acquired);
      const response = await this.request(this.endpoint, {
        method: "POST", signal,
        headers: { "content-type": "application/json", ...(this.options.apiToken ? { authorization: `Bearer ${this.options.apiToken}` } : {}) },
        body: JSON.stringify({
          model: this.modelId, stream: false, think: false, keep_alive: "10m", format: jsonSchema,
          options: { temperature: 0, seed: 42, num_ctx: this.contextTokens, num_predict: this.outputTokens },
          messages: [
            { role: "system", content: `${system}\nReturn only JSON matching this schema: ${JSON.stringify(jsonSchema)}` },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!response.ok) throw new Error(response.status === 404 ? "QWEN_MODEL_NOT_FOUND" : "QWEN_HTTP_ERROR");
      let body: z.infer<typeof responseSchema>;
      try { body = responseSchema.parse(await response.json()); } catch { throw new Error("QWEN_INVALID_RESPONSE"); }
      if (body.done_reason === "length") throw new Error("QWEN_OUTPUT_TRUNCATED");
      let value: T;
      try { value = schema.parse(JSON.parse(body.message.content)); } catch { throw new Error("QWEN_INVALID_OUTPUT"); }
      const elapsed = performance.now() - started;
      return {
        value, metrics: {
          provider: "ollama", modelId: this.modelId, elapsedMs: Math.round(elapsed), queueMs: Math.round(acquired - started),
          loadMs: Math.round((body.load_duration ?? 0) / 1e6), inputTokens: body.prompt_eval_count ?? 0,
          outputTokens: body.eval_count ?? 0, tokensPerSecond: body.eval_duration ? Math.round((body.eval_count ?? 0) * 1e10 / body.eval_duration) / 10 : 0,
        },
      };
    } catch (error) {
      if (signal.aborted) throw new Error("QWEN_TIMEOUT");
      if (error instanceof Error && /^QWEN_[A-Z_]+$/.test(error.message)) throw error;
      throw new Error("QWEN_UNAVAILABLE");
    } finally { release(); }
  }

  private async generateCloud<T>(schema: z.ZodType<T>, system: string, prompt: string, jsonSchema: unknown, signal: AbortSignal, started: number, acquired: number): Promise<{ value: T; metrics: QwenMetrics }> {
    const structured = cloudSchema(jsonSchema);
    if (!isReviewedCloudModel(this.modelId)) throw new Error("QWEN_CLOUD_MODEL_NOT_ALLOWLISTED");
    const profile = cloudModelProfiles[this.modelId];
    const inputBytes = Buffer.byteLength(system + prompt + JSON.stringify(structured), "utf8");
    const estimatedTokens = Math.ceil(inputBytes / 3) + this.outputTokens;
    if (inputBytes > 24000 || estimatedTokens > this.contextTokens) throw new Error("QWEN_INPUT_TOO_LARGE");
    const quota = cloudQuota(this.options.apiKey!);
    const reservation = quota.reserve(estimatedTokens);
    const response = await this.request(this.endpoint, {
      method: "POST", signal, redirect: "error",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.options.apiKey}` },
      body: JSON.stringify({
        model: this.modelId, stream: false, temperature: 0, seed: 42, max_completion_tokens: this.outputTokens,
        ...profile.reasoning,
        response_format: { type: "json_schema", json_schema: { name: "guardian_wallet_response", strict: true, schema: structured } },
        messages: [{ role: "system", content: `${system}\nReturn only the requested JSON object. No tools or signing are available.` }, { role: "user", content: prompt }],
      }),
    });
    if (response.status === 429) {
      const seconds = Math.min(86400, Math.max(1, Number(response.headers.get("retry-after")) || 60));
      quota.coolDown(seconds); throw new QwenRateLimitError("QWEN_RATE_LIMITED", seconds);
    }
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "QWEN_AUTH_FAILED" : response.status === 404 ? "QWEN_MODEL_NOT_FOUND" : "QWEN_HTTP_ERROR");
    let body: z.infer<typeof cloudResponseSchema>;
    try { body = cloudResponseSchema.parse(await response.json()); } catch { throw new Error("QWEN_INVALID_RESPONSE"); }
    reservation.observed(body.usage.prompt_tokens + body.usage.completion_tokens);
    const choice = body.choices[0]!;
    if (body.model !== this.modelId) throw new Error("QWEN_MODEL_MISMATCH");
    if (choice.finish_reason === "length") throw new Error("QWEN_OUTPUT_TRUNCATED");
    if (choice.finish_reason !== "stop" || choice.message.refusal || !choice.message.content) throw new Error("QWEN_INVALID_OUTPUT");
    let value: T;
    try { value = schema.parse(JSON.parse(choice.message.content)); } catch { throw new Error("QWEN_INVALID_OUTPUT"); }
    const headerNumber = (name: string) => { const value = response.headers.get(name); return value !== null && /^\d+$/.test(value) ? Number(value) : undefined; };
    const elapsed = performance.now() - started;
    return { value, metrics: { provider: "groq", modelId: this.modelId, elapsedMs: Math.round(elapsed), queueMs: Math.round(acquired - started), loadMs: 0,
      inputTokens: body.usage.prompt_tokens, outputTokens: body.usage.completion_tokens, tokensPerSecond: Math.round(body.usage.completion_tokens * 10000 / Math.max(1, elapsed - (acquired - started))) / 10,
      remainingRequests: headerNumber("x-ratelimit-remaining-requests"), remainingTokens: headerNumber("x-ratelimit-remaining-tokens"),
      reasoningTokens: body.usage.completion_tokens_details?.reasoning_tokens,
    } };
  }
}

/** Shared environment mapping for API, provider and reviewer deployments. */
export function qwenRuntimeOptions(env: Record<string, string | undefined>): QwenOptions {
  const provider = env.AI_PROVIDER ?? "groq";
  if (provider !== "groq" && provider !== "ollama") throw new Error("QWEN_PROVIDER_NOT_CONFIGURED");
  const modelId = env.AI_MODEL_ID || (provider === "groq" ? defaultCloudModel : "qwen3:8b");
  return { provider, modelId,
    ...(provider === "groq" ? { apiKey: env.GROQ_API_KEY, freeTierConfirmed: env.GROQ_FREE_TIER_CONFIRMED === "true" } : { baseUrl: env.OLLAMA_BASE_URL || "http://127.0.0.1:11434", apiToken: env.OLLAMA_API_TOKEN || undefined }),
    timeoutMs: Number(env.AI_REQUEST_TIMEOUT_MS || 30000), contextTokens: Number(env.AI_CONTEXT_TOKENS || 4096),
    ...(env.AI_OUTPUT_TOKENS ? { outputTokens: Number(env.AI_OUTPUT_TOKENS) } : {}),
  };
}

export { QwenClient as StructuredModelClient, qwenRuntimeOptions as modelRuntimeOptions };
export type ModelOptions = QwenOptions;
export type ModelMetrics = QwenMetrics;
