import Fastify from "fastify";
import { z } from "zod";
import { decideProviderOffer, QwenClient, QwenRateLimitError, type QwenOptions } from "@guardian-wallet/planner";
import { offerIdSchema, serviceCatalog, serviceQuoteSchema } from "@guardian-wallet/shared";
import { requireProviderToken } from "./provider-auth.js";

export async function buildProviderAgent(options: { accessToken: string; signerToken: string; signerUrl: string; qwen: QwenOptions }) {
  const app = Fastify({ logger: { redact: ["req.headers.authorization"] }, bodyLimit: 32768 });
  const client = new QwenClient(options.qwen);
  app.addHook("onRequest", async (request) => { if (request.url !== "/health") requireProviderToken(options.accessToken, request.headers.authorization); });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof QwenRateLimitError) return reply.header("retry-after", String(error.retryAfterSeconds)).code(429).send({ error: error.message, retryAfterSeconds: error.retryAfterSeconds });
    const code = error instanceof z.ZodError ? "INVALID_PROVIDER_REQUEST" : error instanceof Error && /^(QWEN|PROVIDER)_[A-Z0-9_]{1,80}$/.test(error.message) ? error.message : "PROVIDER_AGENT_REQUEST_FAILED";
    return reply.code(error instanceof z.ZodError ? 400 : code === "PROVIDER_AUTH_REQUIRED" ? 401 : 503).send({ error: code });
  });
  app.get("/health", async () => ({ status: "ok", service: "provider-agent", modelId: client.modelId, signingAccess: false }));
  app.post("/request", async (request) => {
    const input = z.strictObject({ requestId: z.string().uuid(), instruction: z.string().min(1).max(4000), preferredOfferId: offerIdSchema }).parse(request.body);
    const decision = await decideProviderOffer(client, input.instruction, input.preferredOfferId);
    if (!decision.accepted || decision.offerId !== input.preferredOfferId) return { accepted: false, reason: decision.summary, modelId: client.modelId };
    const response = await fetch(`${options.signerUrl}/quotes`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${options.signerToken}` },
      body: JSON.stringify({ requestId: input.requestId, offerId: decision.offerId }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      let code = "PROVIDER_SIGNER_UNAVAILABLE";
      try { const body = await response.json() as { error?: unknown }; if (typeof body.error === "string" && /^PROVIDER_[A-Z0-9_]{1,80}$/.test(body.error)) code = body.error; } catch { /* Never forward raw signer/RPC errors. */ }
      throw new Error(code);
    }
    const body = await response.json() as { quote: unknown };
    return { accepted: true, offer: serviceCatalog.find((item) => item.id === decision.offerId), quote: serviceQuoteSchema.parse(body.quote), reason: decision.summary, modelId: client.modelId };
  });
  return app;
}
