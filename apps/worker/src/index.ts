import { z } from "zod";
import { developmentChain } from "@guardian-wallet/shared";

const environment = z.object({
  WORKER_INTERVAL_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  EXECUTION_ENABLED: z.literal("false").default("false"),
}).parse(process.env);

function heartbeat() {
  console.info(JSON.stringify({
    service: "guardian-wallet-worker",
    stage: "scaffold",
    executionEnabled: false,
    chainId: developmentChain.id,
    timestamp: new Date().toISOString(),
  }));
}

heartbeat();
const timer = setInterval(heartbeat, environment.WORKER_INTERVAL_MS);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    clearInterval(timer);
    process.exit(0);
  });
}
