import type { PaymentPlan, PolicySnapshot, ServiceQuote } from "@guardian-wallet/shared";
import { paymentPlanSchema } from "@guardian-wallet/shared";
import {
  encodeAbiParameters, encodeFunctionData, erc20Abi, hashTypedData, keccak256,
  parseAbi, parseAbiParameters, verifyTypedData, type Address, type PublicClient,
} from "viem";

export const guardianAbi = parseAbi([
  "struct PolicyInput { address token; address quoteSigner; address pauseGuardian; uint256 protectedBalance; uint256 perPaymentLimit; uint256 dailyLimit; uint48 validAfter; uint48 validUntil; }",
  "struct Policy { PolicyInput rules; uint64 version; bool installed; bool paused; }",
  "struct ServiceQuote { address account; bytes32 providerId; bytes32 invoiceId; bytes32 serviceHash; address token; address recipient; uint256 amount; uint48 validUntil; }",
  "function executePayments(ServiceQuote[] quotes, bytes[] signatures, uint64 expectedPolicyVersion, uint48 validUntil)",
  "function getPolicy(address account) view returns (Policy)",
  "function isRecipientAllowed(address account, address recipient) view returns (bool)",
  "function spent(address account, address token, uint256 day) view returns (uint256)",
  "function consumed(address account, bytes32 paymentId) view returns (bool)",
  "function configurePolicy(PolicyInput rules, address[] recipients)",
  "function setPaused(address account, bool pause)",
  "event PaymentSettled(address indexed account, bytes32 indexed paymentId, address indexed recipient, uint256 amount, uint64 policyVersion)",
  "error NotInstalled()", "error AlreadyInstalled()", "error InvalidPolicy()", "error Unauthorized()",
  "error Paused()", "error Expired()", "error StalePolicy()", "error InvalidBatch()", "error InvalidQuote()",
  "error RecipientDenied()", "error PaymentLimit()", "error DailyLimit()", "error ProtectedBalance()",
  "error DuplicatePayment()", "error InvalidTransfer()",
]);

export const quoteTypes = { ServiceQuote: [
  { name: "account", type: "address" }, { name: "providerId", type: "bytes32" },
  { name: "invoiceId", type: "bytes32" }, { name: "serviceHash", type: "bytes32" },
  { name: "token", type: "address" }, { name: "recipient", type: "address" },
  { name: "amount", type: "uint256" }, { name: "validUntil", type: "uint48" },
] } as const;

export interface GuardianPolicyInput {
  token: Address; quoteSigner: Address; pauseGuardian: Address;
  protectedBalance: bigint; perPaymentLimit: bigint; dailyLimit: bigint;
  validAfter: number; validUntil: number;
}
export function encodeGuardianPolicyData(rules: GuardianPolicyInput, recipients: readonly Address[]) {
  return encodeAbiParameters(parseAbiParameters("(address token,address quoteSigner,address pauseGuardian,uint256 protectedBalance,uint256 perPaymentLimit,uint256 dailyLimit,uint48 validAfter,uint48 validUntil) rules,address[] recipients"), [rules, recipients]);
}

export function toContractQuote(quote: Omit<ServiceQuote, "signature">) {
  return {
    account: quote.account, providerId: quote.providerId, invoiceId: quote.invoiceId,
    serviceHash: quote.serviceHash, token: quote.token, recipient: quote.recipient,
    amount: BigInt(quote.amountUnits), validUntil: quote.validUntil,
  };
}

export function quoteTypedData(chainId: number, guardianAddress: Address, quote: Omit<ServiceQuote, "signature">) {
  return {
    domain: { name: "GuardianPayments", version: "1", chainId, verifyingContract: guardianAddress },
    types: quoteTypes, primaryType: "ServiceQuote" as const, message: toContractQuote(quote),
  };
}

export function quoteHash(chainId: number, guardian: Address, quote: ServiceQuote) {
  return hashTypedData(quoteTypedData(chainId, guardian, quote));
}

export function getPaymentId(chainId: number, quote: Pick<ServiceQuote, "account" | "providerId" | "invoiceId">) {
  return keccak256(encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "bytes32" }],
    [BigInt(chainId), quote.account, quote.providerId, quote.invoiceId],
  ));
}

export function encodeGuardianPayments(plan: PaymentPlan) {
  const parsed = paymentPlanSchema.parse(plan);
  return encodeFunctionData({
    abi: guardianAbi, functionName: "executePayments",
    args: [parsed.quotes.map(toContractQuote), parsed.quotes.map((q) => q.signature), BigInt(parsed.policyVersion), parsed.validUntil],
  });
}

export async function readPolicySnapshot(client: PublicClient, guardianAddress: Address, account: Address): Promise<PolicySnapshot> {
  const block = await client.getBlock();
  if (!block.hash) throw new Error("UNCONFIRMED_BLOCK");
  const blockNumber = block.number;
  const policy = await client.readContract({ address: guardianAddress, abi: guardianAbi, functionName: "getPolicy", args: [account], blockNumber });
  if (!policy.installed) throw new Error("NOT_INSTALLED");
  const [balance, spent] = await Promise.all([
    client.readContract({ address: policy.rules.token, abi: erc20Abi, functionName: "balanceOf", args: [account], blockNumber }),
    client.readContract({ address: guardianAddress, abi: guardianAbi, functionName: "spent", args: [account, policy.rules.token, block.timestamp / 86400n], blockNumber }),
  ]);
  return {
    chainId: await client.getChainId(), account, guardianAddress, token: policy.rules.token,
    quoteSigner: policy.rules.quoteSigner, policyVersion: policy.version.toString(),
    balanceUnits: balance.toString(), protectedBalanceUnits: policy.rules.protectedBalance.toString(),
    perPaymentLimitUnits: policy.rules.perPaymentLimit.toString(), dailyLimitUnits: policy.rules.dailyLimit.toString(),
    spentUnits: spent.toString(), validAfter: policy.rules.validAfter, validUntil: policy.rules.validUntil,
    installed: policy.installed, paused: policy.paused, observedBlockNumber: blockNumber.toString(),
    observedBlockHash: block.hash, observedAt: Number(block.timestamp),
  };
}

export async function validatePaymentPlan(client: PublicClient, plan: PaymentPlan): Promise<PolicySnapshot> {
  const p = paymentPlanSchema.parse(plan);
  const state = await readPolicySnapshot(client, p.guardianAddress, p.account);
  const fail = (reason: string): never => { throw new Error(reason); };
  if (state.chainId !== p.chainId || state.policyVersion !== p.policyVersion) fail("STALE_POLICY");
  if (state.paused) fail("PAUSED");
  if (state.observedAt < state.validAfter || state.observedAt > Math.min(state.validUntil, p.validUntil)) fail("EXPIRED");
  const ids = new Set<string>();
  let total = 0n;
  for (const quote of p.quotes) {
    if (quote.account.toLowerCase() !== p.account.toLowerCase() || quote.token.toLowerCase() !== state.token.toLowerCase()) fail("QUOTE_BINDING");
    if (quote.validUntil < state.observedAt) fail("EXPIRED_QUOTE");
    if (BigInt(quote.amountUnits) > BigInt(state.perPaymentLimitUnits)) fail("PAYMENT_LIMIT");
    if (!await verifyTypedData({ ...quoteTypedData(p.chainId, p.guardianAddress, quote), address: state.quoteSigner, signature: quote.signature })) fail("INVALID_QUOTE");
    const id = getPaymentId(p.chainId, quote);
    if (ids.has(id)) fail("DUPLICATE_PAYMENT");
    ids.add(id);
    const [allowed, consumed] = await Promise.all([
      client.readContract({ address: p.guardianAddress, abi: guardianAbi, functionName: "isRecipientAllowed", args: [p.account, quote.recipient], blockNumber: BigInt(state.observedBlockNumber) }),
      client.readContract({ address: p.guardianAddress, abi: guardianAbi, functionName: "consumed", args: [p.account, id], blockNumber: BigInt(state.observedBlockNumber) }),
    ]);
    if (!allowed) fail("RECIPIENT_DENIED");
    if (consumed) fail("DUPLICATE_PAYMENT");
    total += BigInt(quote.amountUnits);
  }
  if (total + BigInt(state.spentUnits) > BigInt(state.dailyLimitUnits)) fail("DAILY_LIMIT");
  if (BigInt(state.balanceUnits) < BigInt(state.protectedBalanceUnits) + total) fail("PROTECTED_BALANCE");
  return state;
}
