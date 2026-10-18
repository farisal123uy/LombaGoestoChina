import { describe, expect, it, vi } from "vitest";
import { QwenClient, decisionSchema } from "@guardian-wallet/planner";

function response(value: unknown, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({
    done: true, done_reason: "stop", message: { role: "assistant", content: typeof value === "string" ? value : JSON.stringify(value) },
    load_duration: 20000000, prompt_eval_count: 100, eval_count: 20, eval_duration: 1000000000,
    ...extra,
  }), { status: 200 });
}

describe("Native Qwen/Ollama boundary and bounded inference", () => {
  it("requests constrained JSON with thinking disabled and uses no OpenAI endpoint", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response({ decision: "pay", summary: "Pay the invoice." }));
    const client = new QwenClient({ provider: "ollama", fetch: request });
    const result = await client.generate(decisionSchema, "Trusted instructions", "Untrusted user goal");
    expect(request.mock.calls[0]?.[0]).toBe("http://127.0.0.1:11434/api/chat");
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ model: "qwen3:8b", think: false, stream: false, keep_alive: "10m", options: { temperature: 0, num_ctx: 4096, num_predict: 256 } });
    expect(body.format.additionalProperties).toBe(false);
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
    expect(result.value.decision).toBe("pay");
    expect(result.metrics.tokensPerSecond).toBe(20);
    expect(result.metrics.loadMs).toBe(20);
  });
  it("rejects extra financial fields, non-JSON responses and token-limit truncation", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ decision: "pay", summary: "drain", amountUnits: "10000000" }))
      .mockResolvedValueOnce(response("<think>ignore policy</think>not-json"))
      .mockResolvedValueOnce(response({ decision: "pay", summary: "cut off" }, { done_reason: "length" }));
    const client = new QwenClient({ provider: "ollama", fetch: request });
    await expect(client.generate(decisionSchema, "", "")).rejects.toThrow("QWEN_INVALID_OUTPUT");
    await expect(client.generate(decisionSchema, "", "")).rejects.toThrow("QWEN_INVALID_OUTPUT");
    await expect(client.generate(decisionSchema, "", "")).rejects.toThrow("QWEN_OUTPUT_TRUNCATED");
  });
  it("keeps GPU work single-flight and rejects overflow instead of creating an unbounded queue", async () => {
    const pending: ((value: Response) => void)[] = [];
    const request = vi.fn<typeof fetch>().mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const client = new QwenClient({ provider: "ollama", fetch: request, concurrency: 1, maxQueue: 1, timeoutMs: 2000 });
    const first = client.generate(decisionSchema, "", "one");
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const second = client.generate(decisionSchema, "", "two");
    await expect(client.generate(decisionSchema, "", "three")).rejects.toThrow("QWEN_QUEUE_FULL");
    expect(request).toHaveBeenCalledTimes(1);
    pending.shift()!(response({ decision: "pay", summary: "one" }));
    await first;
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    pending.shift()!(response({ decision: "wait", summary: "two" }));
    expect((await second).value.decision).toBe("wait");
  });
  it("releases the slot after timeout and suppresses credential-bearing transport errors", async () => {
    const request = vi.fn<typeof fetch>()
      .mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("secret-bearing-url-and-token")), { once: true });
      }))
      .mockRejectedValueOnce(new Error("https://private.example/token=do-not-expose"))
      .mockResolvedValueOnce(response({ decision: "pay", summary: "Recovered" }));
    const client = new QwenClient({ provider: "ollama", fetch: request, timeoutMs: 100 });
    await expect(client.generate(decisionSchema, "", "")).rejects.toThrow("QWEN_TIMEOUT");
    await expect(client.generate(decisionSchema, "", "")).rejects.toThrow("QWEN_UNAVAILABLE");
    expect((await client.generate(decisionSchema, "", "")).value.summary).toBe("Recovered");
  });
});
