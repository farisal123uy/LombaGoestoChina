import { buildBootstrap, createDevelopmentPublicClient, createExecutionClient, gasExposure } from "@guardian-wallet/wallet";
import { formatEther } from "viem";
import { loadOnboardingConfiguration } from "./onboarding-config.mjs";

try {
  const context = await loadOnboardingConfiguration();
  const client = createDevelopmentPublicClient(context.api.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
  const bootstrap = await buildBootstrap(client, context.configuration);
  if (bootstrap.installed) {
    console.log(JSON.stringify({ status: "bootstrap_already_installed", kernel: bootstrap.account.address, guardian: bootstrap.guardianAddress, token: bootstrap.tokenAddress, transactionsSent: 0 }, null, 2));
  } else {
    // Both final/stub sponsorship requests explicitly use shouldConsume=false.
    const bundler = createExecutionClient(client, bootstrap.account, context.worker.ZERODEV_RPC_URL, { approvedPaymaster: context.approvedPaymaster }, false);
    const operation = await bundler.prepareUserOperation({ callData: await bootstrap.account.encodeCalls(bootstrap.calls) });
    console.log(JSON.stringify({
      status: "sponsored_bootstrap_deployment_quote_available", chainId: 84532,
      kernel: bootstrap.account.address, guardian: bootstrap.guardianAddress, token: bootstrap.tokenAddress,
      actions: bootstrap.calls.length, paymaster: operation.paymaster,
      maximumNativeGasExposureEth: formatEther(gasExposure(operation)),
      ownerSignatureProvided: false, transactionsSent: 0, sponsorshipQuotaConsumptionRequested: false,
      scope: "CREATE2 contract deployment + Guardian installation quote; actual inclusion still requires owner signature and final sponsorship.",
    }, null, 2));
  }
} catch (error) {
  let text = "";
  for (let value = error, count = 0; value && count < 8; value = value.cause, count++) text += ` ${String(value.message || "")} ${String(value.details || "")}`;
  console.error(JSON.stringify({ status: "bootstrap_deployment_quote_failed", aaCode: text.match(/\bAA\d{2}\b/)?.[0] || null, policyRelated: /polic|sponsor.*not/i.test(text), transactionsSent: 0 }));
  process.exitCode = 1;
}
