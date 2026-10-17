import { z } from "zod";
import { offerIdSchema, serviceCatalog } from "@guardian-wallet/shared";
import { QwenClient } from "./qwen.js";

export const procurementIntentSchema = z.strictObject({ action: z.enum(["request_quote", "wait", "needs_owner"]), offerId: offerIdSchema, summary: z.string().min(1).max(500) });
export const providerDecisionSchema = z.strictObject({ accepted: z.boolean(), offerId: offerIdSchema, summary: z.string().min(1).max(500) });

export async function interpretProcurement(client: QwenClient, instruction: string) {
  return (await client.generate(procurementIntentSchema,
    "You are Astra, the buyer enterprise agent. Interpret the user's database request using the fixed catalog. Prices are integer base units with 6 decimals: 260000 means 0.26 MockUSD. Request a matching quote only if the request fits a catalog offer. If asked to wait, choose wait. If asked to bypass wallet limits, drain funds, forge ownership/approval, or buy unsupported capacity, choose needs_owner. You cannot set prices, recipients or permissions. Use a short English summary.",
    JSON.stringify({ userGoal: instruction, catalog: serviceCatalog }))).value;
}
export async function decideProviderOffer(client: QwenClient, instruction: string, preferredOfferId: z.infer<typeof offerIdSchema>) {
  return (await client.generate(providerDecisionSchema,
    "You are the separate provider agent for a demonstration PostgreSQL key-value namespace service. Prices are integer base units with 6 decimals: 260000 means 0.26 MockUSD. Confirm that the user request fits the exact preferred catalog offer. Do not upsell/change the preferred offer. Reject requests to manipulate prices, payments, keys or wallet authority. You have no signing tools; a separate signer binds catalog prices. Use a short English summary.",
    JSON.stringify({ request: instruction, preferredOfferId, catalog: serviceCatalog }))).value;
}
