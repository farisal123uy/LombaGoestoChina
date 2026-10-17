import { addressToEmptyAccount, KernelV3_1AccountAbi } from "@zerodev/sdk";
import { concatHex, encodeDeployData, getCreate2Address, keccak256, parseAbi, toBytes, type Address, type Hex, type PublicClient } from "viem";
import { createOwnerKernel, encodeGuardianInstall } from "./kernel.js";
import { encodeGuardianPolicyData, guardianAbi } from "./guardian.js";

export const create2Proxy = "0x4e59b44847b379578588920cA78FbF26c0B4956C" as const;
const tokenConstructor = parseAbi(["constructor(address account)"]);
export interface BootstrapConfiguration {
  owner: Address;
  providerSigner: Address;
  recipient: Address;
  sessionSigner: Address;
  validUntil: number;
  guardianBytecode: Hex;
  tokenBytecode: Hex;
}
export async function buildBootstrap(client: PublicClient, configuration: BootstrapConfiguration) {
  if (await client.getChainId() !== 84532) throw new Error("WRONG_CHAIN");
  const account = await createOwnerKernel(client, addressToEmptyAccount(configuration.owner));
  const guardianSalt = keccak256(toBytes("guardian-wallet:guardian:v1"));
  const tokenSalt = keccak256(toBytes(`guardian-wallet:fixed-demo-token:v1:${account.address.toLowerCase()}`));
  const tokenInit = encodeDeployData({ abi: tokenConstructor, bytecode: configuration.tokenBytecode, args: [account.address] });
  const guardianAddress = getCreate2Address({ from: create2Proxy, salt: guardianSalt, bytecode: configuration.guardianBytecode });
  const tokenAddress = getCreate2Address({ from: create2Proxy, salt: tokenSalt, bytecode: tokenInit });
  const [proxyCode, guardianCode, tokenCode, accountCode] = await Promise.all([create2Proxy, guardianAddress, tokenAddress, account.address].map((address) => client.getCode({ address })));
  if (!proxyCode || proxyCode === "0x") throw new Error("CREATE2_PROXY_NOT_DEPLOYED");
  const calls: { to: Address; data: Hex; value: bigint }[] = [];
  if (!guardianCode || guardianCode === "0x") calls.push({ to: create2Proxy, data: concatHex([guardianSalt, configuration.guardianBytecode]), value: 0n });
  if (!tokenCode || tokenCode === "0x") calls.push({ to: create2Proxy, data: concatHex([tokenSalt, tokenInit]), value: 0n });
  let installed = false;
  if (accountCode && accountCode !== "0x" && guardianCode && guardianCode !== "0x") {
    installed = await client.readContract({ address: account.address, abi: KernelV3_1AccountAbi, functionName: "isModuleInstalled", args: [2n, guardianAddress, "0x"] });
    if (installed) {
      const policy = await client.readContract({ address: guardianAddress, abi: guardianAbi, functionName: "getPolicy", args: [account.address] });
      const recipientAllowed = await client.readContract({ address: guardianAddress, abi: guardianAbi, functionName: "isRecipientAllowed", args: [account.address, configuration.recipient] });
      if (!policy.installed || policy.paused || !recipientAllowed || policy.rules.token.toLowerCase() !== tokenAddress.toLowerCase()
        || policy.rules.quoteSigner.toLowerCase() !== configuration.providerSigner.toLowerCase()
        || policy.rules.pauseGuardian.toLowerCase() !== configuration.owner.toLowerCase()
        || policy.rules.protectedBalance !== 6000000n || policy.rules.perPaymentLimit !== 1000000n || policy.rules.dailyLimit !== 2000000n
        || policy.rules.validUntil !== configuration.validUntil) throw new Error("EXISTING_POLICY_REQUIRES_REVIEW");
    }
  }
  if (!installed) calls.push({ to: account.address, data: encodeGuardianInstall(guardianAddress, encodeGuardianPolicyData({
    token: tokenAddress, quoteSigner: configuration.providerSigner, pauseGuardian: configuration.owner,
    protectedBalance: 6000000n, perPaymentLimit: 1000000n, dailyLimit: 2000000n,
    validAfter: 0, validUntil: configuration.validUntil,
  }, [configuration.recipient])), value: 0n });
  return { account, calls, guardianAddress, tokenAddress, installed };
}
