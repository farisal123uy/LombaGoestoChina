import type { ModelOptions } from "@guardian-wallet/planner";
import type { ReviewWorkspace } from "../../apps/api/src/review-host.js";
export function createReviewWorkspace(options?: ModelOptions, diagnostics?: {
  databaseProfile?: "compact" | "default";
  observeStage?(stage: { stage: string; elapsedMs: number; rss: number; heapTotal: number; heapUsed: number; external: number; arrayBuffers: number }): void;
}): Promise<ReviewWorkspace>;
