import { addressToEmptyAccount, createZeroDevPaymasterClient } from "@zerodev/sdk";
import { createOwnerKernel, createDevelopmentPublicClient, entryPoint } from "@guardian-wallet/wallet";
import { getAddress, http, zeroAddress } from "viem";
import { baseSepolia } from "viem/chains";
import { readEnvironment, verifyProject } from "../services/config.mjs";

await verifyProject();
const api = await readEnvironment("api"), worker = await readEnvironment("worker");
if (!api.OWNER_ADDRESS || !worker.ZERODEV_RPC_URL) {
  console.log(JSON.stringify({ status: "missing_owner_or_zerodev", transactionsSent: 0 }));
  process.exit(0);
}
try {
  const owner = getAddress(api.OWNER_ADDRESS);
  const client = createDevelopmentPublicClient(api.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
  if (await client.getChainId() !== 84532) throw new Error("WRONG_CHAIN");
  // Public owner address only. The empty account cannot sign anything.
  const account = await createOwnerKernel(client, addressToEmptyAccount(owner));
  const factory = await account.getFactoryArgs();
  const fees = await client.estimateFeesPerGas();
  const request = {
    sender: account.address, nonce: await account.getNonce(),
    ...factory,
    callData: await account.encodeCalls([{ to: owner, value: 0n, data: "0x" }]),
    callGasLimit: 300000n, verificationGasLimit: 1500000n, preVerificationGas: 100000n,
    maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    signature: "0x",
  };
  request.signature = await account.getStubSignature(request);
  const paymaster = createZeroDevPaymasterClient({ chain: baseSepolia, transport: http(worker.ZERODEV_RPC_URL, { timeout: 15000, retryCount: 0 }) });
  const sponsorship = await paymaster.sponsorUserOperation({
    userOperation: { ...request, chainId: 84532, entryPointAddress: entryPoint.address },
    shouldConsume: false, shouldOverrideFee: false,
  });
  const available = sponsorship.paymaster && sponsorship.paymaster.toLowerCase() !== zeroAddress;
  console.log(JSON.stringify({
    status: available ? "testnet_sponsorship_quote_available" : "no_paymaster_reported",
    chainId: 84532, probeAccount: account.address, paymaster: sponsorship.paymaster,
    accountDeployedByProbe: false, ownerSignatureProvided: false, transactionsSent: 0,
    sponsorshipQuotaConsumptionRequested: false,
    scope: "Counterfactual Kernel creation + zero-value owner call quote only; not deployment success, not gas balance transfer, not a service-pricing guarantee.",
  }, null, 2));
} catch (error) {
  let text = "";
  for (let value = error, depth = 0; value && depth < 8; value = value.cause, depth++) text += ` ${String(value.message || "")} ${String(value.details || "")}`;
  let status = "sponsorship_probe_failed_details_suppressed";
  if (/insufficient.*(?:fund|balance)|gas.?tank|deposit.*required|balance.*too low/i.test(text)) status = "project_gas_funding_or_billing_required";
  else if (/policy|whitelist|not.*sponsor|sponsor.*not/i.test(text)) status = "sponsorship_policy_or_eligibility_not_enabled";
  else if (/method.*not.*found|unsupported.*method|-32601/i.test(text)) status = "paymaster_method_not_available_on_configured_rpc";
  else if (/unauthorized|forbidden|invalid.*api.?key|401|403/i.test(text)) status = "paymaster_access_not_authorized";
  console.log(JSON.stringify({
    status,
    policyMissing: /no.{0,80}(?:gas.{0,20})?polic|polic.{0,80}(?:not found|not configured|not set|does not exist)/i.test(text),
    operationValidationFailed: /AA\d\d|FailedOp|signature.*(?:invalid|failed)/i.test(text),
    billingOrCreditsRequired: /credit card|billing|gas.?credit|gas.?tank|insufficient.*balance/i.test(text),
    ownerSignatureProvided: false, transactionsSent: 0, sponsorshipQuotaConsumptionRequested: false,
  }, null, 2));
  process.exitCode = 1;
}
