import { join } from "node:path";
import { OnboardingJournal, OnboardingService, buildOnboardingApp } from "../../apps/api/dist/onboarding.js";
import { createDevelopmentPublicClient } from "@guardian-wallet/wallet";
import { loadOnboardingConfiguration, synchronizeRuntime } from "./onboarding-config.mjs";

try {
  const context = await loadOnboardingConfiguration();
  const service = new OnboardingService({
    client: createDevelopmentPublicClient(context.api.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"),
    configuration: context.configuration, bundlerUrl: context.worker.ZERODEV_RPC_URL,
    sponsorship: { approvedPaymaster: context.approvedPaymaster },
    maxGasCostWei: BigInt(process.env.ONBOARDING_MAX_GAS_COST_WEI || "1000000000000000"),
    journal: new OnboardingJournal(join(context.directory, "operations.json")),
    syncRuntime: (deployment, signature) => synchronizeRuntime(context, deployment, signature),
  });
  const app = await buildOnboardingApp(service, context.configuration.owner, context.api.WEB_ORIGIN || "http://localhost:3000");
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void app.close(); });
  await app.listen({ host: "127.0.0.1", port: 4100 });
  console.log("Owner setup ready: open http://localhost:3000/setup. Signing happens in MetaMask. No owner private key is requested.");
} catch {
  console.error("ONBOARDING_STARTUP_FAILED_CHECK_OWNER_RPC_BUILD_AND_LOCAL_CONFIGURATION");
  process.exitCode = 1;
}
