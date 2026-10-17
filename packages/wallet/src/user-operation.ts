import { z } from "zod";
import { addressSchema, unitsSchema } from "@guardian-wallet/shared";
import type { UserOperation } from "viem/account-abstraction";
import { getUserOperationHash } from "viem/account-abstraction";
import { type Address, type Hex } from "viem";
import { entryPoint } from "./kernel.js";

const bytes = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/).transform((v) => v as Hex);
const wireSchema = z.strictObject({
  sender: addressSchema, nonce: unitsSchema, callData: bytes, signature: bytes,
  callGasLimit: unitsSchema, verificationGasLimit: unitsSchema, preVerificationGas: unitsSchema,
  maxFeePerGas: unitsSchema, maxPriorityFeePerGas: unitsSchema,
  factory: addressSchema.optional(), factoryData: bytes.optional(),
  paymaster: addressSchema.optional(), paymasterData: bytes.optional(),
  paymasterVerificationGasLimit: unitsSchema.optional(), paymasterPostOpGasLimit: unitsSchema.optional(),
}).superRefine((v, ctx) => {
  if (Boolean(v.factory) !== (v.factoryData !== undefined)) ctx.addIssue({ code: "custom", message: "Incomplete factory fields" });
  const count = [v.paymaster, v.paymasterData, v.paymasterVerificationGasLimit, v.paymasterPostOpGasLimit].filter((x) => x !== undefined).length;
  if (count !== 0 && count !== 4) ctx.addIssue({ code: "custom", message: "Incomplete paymaster fields" });
  if (BigInt(v.maxPriorityFeePerGas) > BigInt(v.maxFeePerGas)) ctx.addIssue({ code: "custom", message: "Invalid gas price" });
});

export function serializeOperation(operation: UserOperation<"0.7">) {
  return JSON.stringify(wireSchema.parse({
    sender: operation.sender, nonce: operation.nonce.toString(), callData: operation.callData,
    signature: operation.signature, callGasLimit: operation.callGasLimit.toString(),
    verificationGasLimit: operation.verificationGasLimit.toString(), preVerificationGas: operation.preVerificationGas.toString(),
    maxFeePerGas: operation.maxFeePerGas.toString(), maxPriorityFeePerGas: operation.maxPriorityFeePerGas.toString(),
    factory: operation.factory, factoryData: operation.factoryData,
    paymaster: operation.paymaster, paymasterData: operation.paymasterData,
    paymasterVerificationGasLimit: operation.paymasterVerificationGasLimit?.toString(),
    paymasterPostOpGasLimit: operation.paymasterPostOpGasLimit?.toString(),
  }));
}
export function deserializeOperation(payload: string): UserOperation<"0.7"> {
  const p = wireSchema.parse(JSON.parse(payload));
  return {
    ...p, nonce: BigInt(p.nonce), callGasLimit: BigInt(p.callGasLimit), verificationGasLimit: BigInt(p.verificationGasLimit),
    preVerificationGas: BigInt(p.preVerificationGas), maxFeePerGas: BigInt(p.maxFeePerGas), maxPriorityFeePerGas: BigInt(p.maxPriorityFeePerGas),
    paymasterVerificationGasLimit: p.paymasterVerificationGasLimit === undefined ? undefined : BigInt(p.paymasterVerificationGasLimit),
    paymasterPostOpGasLimit: p.paymasterPostOpGasLimit === undefined ? undefined : BigInt(p.paymasterPostOpGasLimit),
  };
}
export function operationHash(operation: UserOperation<"0.7">, chainId: number) {
  return getUserOperationHash({ userOperation: operation, chainId, entryPointAddress: entryPoint.address, entryPointVersion: "0.7" });
}
export function gasExposure(operation: Pick<UserOperation<"0.7">, "callGasLimit" | "verificationGasLimit" | "preVerificationGas" | "maxFeePerGas" | "paymasterVerificationGasLimit" | "paymasterPostOpGasLimit">) {
  return (operation.callGasLimit + operation.verificationGasLimit + operation.preVerificationGas + (operation.paymasterVerificationGasLimit ?? 0n) + (operation.paymasterPostOpGasLimit ?? 0n)) * operation.maxFeePerGas;
}
export function assertPaymaster(operation: { paymaster?: Address }, approved?: Address) {
  if (approved) {
    if (!operation.paymaster || operation.paymaster.toLowerCase() !== approved.toLowerCase()) throw new Error("PAYMASTER_NOT_APPROVED");
  } else if (operation.paymaster) throw new Error("UNEXPECTED_PAYMASTER");
}
