/** Reviewed Groq Free-plan candidates. Actual account tier remains operator-owned. */
export const cloudModelProfiles = {
  "openai/gpt-oss-120b": { family: "gpt-oss", defaultCompletionTokens: 1024, maxCompletionTokens: 2048, reasoning: { reasoning_effort: "low", include_reasoning: false } },
  "openai/gpt-oss-20b": { family: "gpt-oss", defaultCompletionTokens: 1024, maxCompletionTokens: 2048, reasoning: { reasoning_effort: "low", include_reasoning: false } },
  "qwen/qwen3.8-27b": { family: "qwen", defaultCompletionTokens: 256, maxCompletionTokens: 512, reasoning: { reasoning_effort: "none", reasoning_format: "hidden" } },
} as const;
export const defaultCloudModel = "openai/gpt-oss-120b";
export type CloudModelId = keyof typeof cloudModelProfiles;
export function isReviewedCloudModel(value: string): value is CloudModelId { return Object.hasOwn(cloudModelProfiles, value); }
