import { createKernelAccount, addressToEmptyAccount, KernelV3_1AccountAbi, type CreateKernelAccountReturnType } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { toPermissionValidator, PolicyFlags } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toCallPolicy, CallPolicyVersion, toTimestampPolicy, CallType } from "@zerodev/permissions/policies";
import type { Signer } from "@zerodev/sdk/types";
import { concatHex, encodeAbiParameters, encodeFunctionData, toFunctionSelector, zeroAddress, type Address, type Hex } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";

export const kernelVersion = "0.3.1" as const;
export const entryPoint = { address: entryPoint07Address, version: "0.7" } as const;
type KernelClient = Parameters<typeof createKernelAccount>[0];
export const guardianPaymentSelector = toFunctionSelector("executePayments((address,bytes32,bytes32,bytes32,address,address,uint256,uint48)[],bytes[],uint64,uint48)");

export async function createGuardianPermission(client: KernelClient, signer: Signer, guardian: Address, validUntil: number) {
  return toPermissionValidator(client, {
    signer: await toECDSASigner({ signer }), entryPoint, kernelVersion,
    // Kernel's SKIP_SIGNATURE flag rejects ERC-1271 for this permission entirely.
    flag: PolicyFlags.NOT_FOR_VALIDATE_SIG,
    policies: [
      toCallPolicy({ policyVersion: CallPolicyVersion.V0_0_4, permissions: [
        { target: guardian, selector: guardianPaymentSelector, callType: CallType.CALL, valueLimit: 0n },
      ] }),
      toTimestampPolicy({ validUntil }),
    ],
  });
}

export async function createOwnerKernel(client: KernelClient, owner: Signer, initConfig: Hex[] = [], index = 0n): Promise<CreateKernelAccountReturnType<"0.7">> {
  const sudo = await signerToEcdsaValidator(client, { signer: owner, entryPoint, kernelVersion });
  return createKernelAccount(client, { entryPoint, kernelVersion, plugins: { sudo }, initConfig, useMetaFactory: false, index });
}

/** Owner-signed enable authorization or an already installed permission; no owner key. */
export async function createAgentKernel(client: KernelClient, account: Address, signer: Signer, guardian: Address, validUntil: number, enableSignature?: Hex): Promise<CreateKernelAccountReturnType<"0.7">> {
  const regular = await createGuardianPermission(client, signer, guardian, validUntil);
  return createKernelAccount(client, { address: account, entryPoint, kernelVersion, useMetaFactory: false, plugins: { regular, isPreInstalled: !enableSignature, pluginEnableSignature: enableSignature } });
}

/** Prepare a wallet-signable permission authorization using PUBLIC addresses only. */
export async function getGuardianSessionAuthorization(client: KernelClient, account: Address, owner: Address, session: Address, guardian: Address, validUntil: number) {
  const sudo = await signerToEcdsaValidator(client, { signer: addressToEmptyAccount(owner), entryPoint, kernelVersion });
  const regular = await createGuardianPermission(client, addressToEmptyAccount(session), guardian, validUntil);
  const kernel = await createKernelAccount(client, { address: account, entryPoint, kernelVersion, useMetaFactory: false, plugins: { sudo, regular } });
  return { permissionId: regular.getIdentifier(), typedData: await kernel.kernelPluginManager.getPluginsEnableTypedData(account) };
}

export function encodeGuardianInstall(guardian: Address, policyData: Hex) {
  return encodeFunctionData({ abi: KernelV3_1AccountAbi, functionName: "installModule", args: [
    2n, guardian, concatHex([zeroAddress, encodeAbiParameters([{ type: "bytes" }, { type: "bytes" }], [policyData, "0x"])]),
  ] });
}

/** Invalidates all currently enabled non-root permissions; owner route only. */
export function encodeRevokeSessions(currentNonce: number) {
  return encodeFunctionData({ abi: KernelV3_1AccountAbi, functionName: "invalidateNonce", args: [currentNonce + 1] });
}
