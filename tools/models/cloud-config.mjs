import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { qwenRuntimeOptions } from "@guardian-wallet/planner";
import { readEnvironment } from "../services/config.mjs";

export async function loadModelOptions({ local = false } = {}) {
  let saved = {};
  try { saved = parseEnv(await readFile(new URL("../../.local/ai-cloud.env", import.meta.url), "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const env = { ...await readEnvironment("api"), ...saved, ...process.env, AI_PROVIDER: local ? "ollama" : "groq" };
  if (local) { env.AI_MODEL_ID = process.env.AI_MODEL_ID || "qwen3:8b"; env.AI_OUTPUT_TOKENS = process.env.AI_OUTPUT_TOKENS || "256"; delete env.GROQ_API_KEY; }
  return qwenRuntimeOptions(env);
}
