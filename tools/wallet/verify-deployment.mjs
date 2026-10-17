import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDevelopmentPublicClient, deserializeOperation, entryPoint, operationHash, readPolicySnapshot } from "@guardian-wallet/wallet";
import { parseEventLogs, verifyMessage } from "viem";
import { entryPoint07Abi } from "viem/account-abstraction";
import { readEnvironment, root, verifyProject } from "../services/config.mjs";

try {
  await verifyProject();
  const api = await readEnvironment("api");
  const deployment = JSON.parse(await readFile(join(root, ".local/onboarding/deployment.json"), "utf8"));
  const journal = JSON.parse(await readFile(join(root, ".local/onboarding/operations.json"), "utf8"));
  const record = journal.operation;
  if (record?.status !== "confirmed" || !record.transactionHash) throw new Error("DEPLOYMENT_NOT_CONFIRMED");
  const client = createDevelopmentPublicClient(api.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");
  if (await client.getChainId() !== 84532) throw new Error("WRONG_CHAIN");
  const receipt = await client.getTransactionReceipt({ hash: record.transactionHash });
  const operation = deserializeOperation(record.payload);
  const hash = operationHash(operation, 84532);
  const event = parseEventLogs({ abi: entryPoint07Abi, eventName: "UserOperationEvent", logs: receipt.logs.filter((l) => l.address.toLowerCase() === entryPoint.address.toLowerCase()) }).find((e) => e.args.userOpHash.toLowerCase() === hash.toLowerCase());
  if (receipt.status !== "success" || !event?.args.success || event.args.sender.toLowerCase() !== deployment.kernel.toLowerCase() || event.args.nonce !== operation.nonce) throw new Error("RECEIPT_BINDING_FAILED");
  if (!await verifyMessage({ address: deployment.owner, message: { raw: hash }, signature: operation.signature })) throw new Error("OWNER_SIGNATURE_INVALID");
  const policy = await readPolicySnapshot(client, deployment.guardian, deployment.kernel);
  const canonical = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (canonical.hash !== receipt.blockHash || policy.token.toLowerCase() !== deployment.token.toLowerCase() || policy.quoteSigner.toLowerCase() !== deployment.providerSigner.toLowerCase() || !policy.installed) throw new Error("DEPLOYMENT_POLICY_BINDING_FAILED");
  const report = {
    verifiedAt: new Date().toISOString(), evidenceType: "public-base-sepolia-owner-signed-sponsored-deployment",
    chainId: 84532, owner: deployment.owner, kernel: deployment.kernel, guardian: deployment.guardian, token: deployment.token,
    providerSigner: deployment.providerSigner, recipient: deployment.recipient, sessionSigner: deployment.sessionSigner,
    userOperationHash: hash, transactionHash: receipt.transactionHash, explorer: `https://sepolia.basescan.org/tx/${receipt.transactionHash}`,
    blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash, paymaster: event.args.paymaster,
    ownerSignatureVerified: true, outerTransactionSuccess: true, userOperationSuccess: true,
    tokenBalanceUnits: policy.balanceUnits, protectedBalanceUnits: policy.protectedBalanceUnits,
    perPaymentLimitUnits: policy.perPaymentLimitUnits, dailyLimitUnits: policy.dailyLimitUnits, policyVersion: policy.policyVersion,
    modulePaused: policy.paused, sessionAuthorizationRecorded: Boolean(journal.sessionSignature), runtimeSynchronized: Boolean(journal.runtimeSynced),
    scope: "Public testnet deployment and policy verification. No service procurement/payment completion claim; testnet acceptance for final competition evidence remains organizer-dependent.",
  };
  if (process.argv.includes("--record")) await writeFile(join(root, "docs/evidence/public-deployment.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch {
  console.error("DEPLOYMENT_VERIFICATION_FAILED_DETAILS_SUPPRESSED");
  process.exitCode = 1;
}
