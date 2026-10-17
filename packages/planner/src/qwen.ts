import { z } from "zod";

export interface QwenOptions {
  baseUrl?: string;
  modelId?: string;
  apiToken?: string;
  timeoutMs?: number;
  contextTokens?: number;
  outputTokens?: number;
  concurrency?: number;
  maxQueue?: number;
  fetch?: typeof globalThis.fetch;
}
export interface QwenMetrics {
  provider: "ollama";
  modelId: string;
  elapsedMs: number;
  queueMs: number;
  loadMs: number;
  inputTokens: number;
  outputTokens: number;
  tokensPerSecond: number;
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

/** Native Ollama transport. No OpenAI endpoint/key or model tool execution. */
export class QwenClient {
  readonly modelId: string;
  private readonly endpoint: string;
  private readonly gate: InferenceGate;
  private readonly timeoutMs: number;
  private readonly contextTokens: number;
  private readonly outputTokens: number;
  private readonly request: typeof globalThis.fetch;
  constructor(private readonly options: QwenOptions = {}) {
    const url = new URL(options.baseUrl ?? "http://127.0.0.1:11434");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("INVALID_MODEL_ENDPOINT");
    this.endpoint = `${url.toString().replace(/\/$/, "")}/api/chat`;
    this.modelId = options.modelId ?? "qwen3:8b";
    if (!this.modelId.toLowerCase().includes("qwen") || this.modelId.length > 120 || /[\s\r\n]/.test(this.modelId)) throw new Error("INVALID_QWEN_MODEL_ID");
    this.timeoutMs = options.timeoutMs ?? 45000;
    this.contextTokens = options.contextTokens ?? 4096;
    this.outputTokens = options.outputTokens ?? 256;
    const concurrency = options.concurrency ?? 1, maxQueue = options.maxQueue ?? 8;
    for (const [value, min, max] of [[this.timeoutMs, 100, 120000], [this.contextTokens, 1024, 8192], [this.outputTokens, 32, 512], [concurrency, 1, 2], [maxQueue, 0, 32]]) {
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
}
