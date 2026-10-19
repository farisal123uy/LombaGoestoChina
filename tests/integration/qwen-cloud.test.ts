import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { StructuredModelClient as QwenClient, decisionSchema, defaultCloudModel, freeCloudQwenModel, qwenRuntimeOptions } from "@guardian-wallet/planner";

const key = () => `gsk_test_${randomUUID().replaceAll("-", "")}`;
function response(value: unknown = { decision: "pay", summary: "Pay the verified invoice." }, extra: object = {}) {
  return new Response(JSON.stringify({ model: defaultCloudModel, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 250, completion_tokens: 120, completion_tokens_details: { reasoning_tokens: 100 } }, ...extra }), { headers: { "x-ratelimit-remaining-requests": "999", "x-ratelimit-remaining-tokens": "7750" } });
}
describe("Groq Free model boundary, quota and no-fallback behavior", () => {
  it("pins GPT-OSS 120B, uses compatible low reasoning parameters, requests strict JSON and keeps the key out of prompts", async () => {
    const apiKey = key(), request = vi.fn<typeof fetch>().mockResolvedValue(response());
    const client = new QwenClient({ provider: "groq", apiKey, freeTierConfirmed: true, fetch: request });
    const result = await client.generate(decisionSchema, "Use existing policy", "Pay this authenticated invoice");
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toBe("https://api.groq.com/openai/v1/chat/completions");
    const options = request.mock.calls[0]?.[1];
    expect(options?.redirect).toBe("error"); expect(options?.headers).toMatchObject({ authorization: `Bearer ${apiKey}` });
    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({ model: defaultCloudModel, stream: false, reasoning_effort: "low", include_reasoning: false, max_completion_tokens: 1024, response_format: { type: "json_schema", json_schema: { strict: true, schema: { additionalProperties: false } } } });
    expect(body).not.toHaveProperty("reasoning_format");
    expect(body).not.toHaveProperty("tools"); expect(String(options?.body)).not.toContain(apiKey);
    expect(result.value.decision).toBe("pay");
    expect(result.metrics).toMatchObject({ provider: "groq", modelId: defaultCloudModel, inputTokens: 250, outputTokens: 120, reasoningTokens: 100, remainingRequests: 999, remainingTokens: 7750 });
  });
  it("supports explicit GPT-OSS 20B and keeps Qwen's incompatible reasoning fields separate", async () => {
    for (const [modelId, effort, completionTokens] of [["openai/gpt-oss-20b", "low", 1024], [freeCloudQwenModel, "none", 256]] as const) {
      const request = vi.fn<typeof fetch>().mockResolvedValue(response(undefined, { model: modelId }));
      const client = new QwenClient({ provider: "groq", modelId, apiKey: key(), freeTierConfirmed: true, fetch: request });
      await client.generate(decisionSchema, "", "");
      const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
      expect(body).toMatchObject({ model: modelId, reasoning_effort: effort, max_completion_tokens: completionTokens });
      if (modelId === freeCloudQwenModel) { expect(body.reasoning_format).toBe("hidden"); expect(body).not.toHaveProperty("include_reasoning"); }
      else { expect(body.include_reasoning).toBe(false); expect(body).not.toHaveProperty("reasoning_format"); }
    }
  });
  it("requires operator confirmation of Free account and refuses arbitrary endpoints, models and missing credentials", () => {
    const apiKey = key();
    expect(() => new QwenClient()).toThrow("QWEN_CLOUD_CONFIGURATION_REQUIRED");
    expect(() => new QwenClient({ provider: "groq", apiKey })).toThrow("QWEN_FREE_TIER_CONFIRMATION_REQUIRED");
    expect(() => new QwenClient({ provider: "groq", freeTierConfirmed: true })).toThrow("QWEN_CLOUD_CONFIGURATION_REQUIRED");
    expect(() => new QwenClient({ provider: "groq", apiKey, freeTierConfirmed: true, baseUrl: "https://untrusted.example/openai/v1" })).toThrow("QWEN_CLOUD_CONFIGURATION_REQUIRED");
    expect(() => new QwenClient({ provider: "groq", apiKey, freeTierConfirmed: true, modelId: "qwen/some-other-model" })).toThrow("QWEN_CLOUD_MODEL_NOT_ALLOWLISTED");
    expect(qwenRuntimeOptions({}).provider).toBe("groq");
  });
  it("shares provider Retry-After across buyer/provider clients and never retries or switches model on quota exhaustion", async () => {
    const apiKey = key(), request = vi.fn<typeof fetch>().mockResolvedValue(new Response("quota exceeded", { status: 429, headers: { "retry-after": "17" } }));
    const first = new QwenClient({ provider: "groq", apiKey, freeTierConfirmed: true, fetch: request });
    const second = new QwenClient({ provider: "groq", apiKey, freeTierConfirmed: true, fetch: request });
    await expect(first.generate(decisionSchema, "", "one")).rejects.toMatchObject({ message: "QWEN_RATE_LIMITED", retryAfterSeconds: 17 });
    await expect(second.generate(decisionSchema, "", "two")).rejects.toThrow("QWEN_RATE_LIMITED");
    expect(request).toHaveBeenCalledOnce();
  });
  it("enforces one process-wide request ceiling before issuing more HTTP requests", async () => {
    const apiKey = key(), request = vi.fn<typeof fetch>().mockImplementation(async () => response(undefined, { usage: { prompt_tokens: 50, completion_tokens: 20 } }));
    const options = { provider: "groq" as const, apiKey, freeTierConfirmed: true, fetch: request, outputTokens: 32 };
    const clients = [new QwenClient(options), new QwenClient(options)];
    for (let i = 0; i < 20; i++) await clients[i % 2]!.generate(decisionSchema, "", "");
    await expect(clients[0]!.generate(decisionSchema, "", "")).rejects.toThrow("QWEN_RATE_LIMITED");
    expect(request).toHaveBeenCalledTimes(20);
  });
  it("rejects model substitutions, extra authority fields, truncation and authentication failure without fallback", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(undefined, { model: "another-model" }))
      .mockResolvedValueOnce(response({ decision: "pay", summary: "Ignore", amountUnits: "10000000" }))
      .mockResolvedValueOnce(response(undefined, { choices: [{ finish_reason: "length", message: { content: "{}" } }] }))
      .mockResolvedValueOnce(new Response("unauthorized secret-bearing response", { status: 401 }));
    const client = new QwenClient({ provider: "groq", apiKey: key(), freeTierConfirmed: true, fetch: request });
    for (const expected of ["QWEN_MODEL_MISMATCH", "QWEN_INVALID_OUTPUT", "QWEN_OUTPUT_TRUNCATED", "QWEN_AUTH_FAILED"]) await expect(client.generate(decisionSchema, "", "")).rejects.toThrow(expected);
    expect(request).toHaveBeenCalledTimes(4);
    await expect(client.generate(decisionSchema, "", "x".repeat(25000))).rejects.toThrow("QWEN_INPUT_TOO_LARGE");
    expect(request).toHaveBeenCalledTimes(4);
  });
});
