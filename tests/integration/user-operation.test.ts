import { describe, expect, it } from "vitest";
import { assertPaymaster, deserializeOperation, gasExposure, operationHash, serializeOperation } from "@guardian-wallet/wallet";
import type { UserOperation } from "viem/account-abstraction";

const operation: UserOperation<"0.7"> = {
  sender: "0x1111111111111111111111111111111111111111", nonce: 3n, callData: "0x1234", signature: "0x",
  callGasLimit: 100n, verificationGasLimit: 200n, preVerificationGas: 10n, maxFeePerGas: 20n, maxPriorityFeePerGas: 2n,
  factory: "0x2222222222222222222222222222222222222222", factoryData: "0xabcd",
  paymaster: "0x3333333333333333333333333333333333333333", paymasterData: "0xbeef", paymasterVerificationGasLimit: 30n, paymasterPostOpGasLimit: 40n,
};
describe("Exact UserOperation persistence and sponsorship binding", () => {
  it("round-trips every hash-bearing factory/paymaster field without numeric precision loss", () => {
    const full = { ...operation, nonce: 2n ** 200n + 123n };
    const restored = deserializeOperation(serializeOperation(full));
    expect(restored).toEqual(full);
    expect(operationHash(restored, 84532)).toBe(operationHash(full, 84532));
    expect(operationHash({ ...restored, paymasterData: "0xffff" }, 84532)).not.toBe(operationHash(full, 84532));
    expect(operationHash(restored, 1)).not.toBe(operationHash(full, 84532));
  });
  it("counts verification/post-op paymaster gas in the maximum exposure", () => {
    expect(gasExposure(operation)).toBe(7600n);
    expect(gasExposure({ ...operation, paymasterVerificationGasLimit: undefined, paymasterPostOpGasLimit: undefined })).toBe(6200n);
  });
  it("rejects an unknown paymaster and sponsored/native-mode mismatches", () => {
    expect(() => assertPaymaster(operation, operation.paymaster)).not.toThrow();
    expect(() => assertPaymaster(operation)).toThrow("UNEXPECTED_PAYMASTER");
    expect(() => assertPaymaster({}, operation.paymaster)).toThrow("PAYMASTER_NOT_APPROVED");
    expect(() => assertPaymaster(operation, operation.sender)).toThrow("PAYMASTER_NOT_APPROVED");
  });
  it("refuses partial factory/paymaster payloads and extra persisted fields", () => {
    const parsed = JSON.parse(serializeOperation(operation));
    delete parsed.paymasterPostOpGasLimit;
    expect(() => deserializeOperation(JSON.stringify(parsed))).toThrow();
    const factory = JSON.parse(serializeOperation(operation));
    delete factory.factoryData;
    expect(() => deserializeOperation(JSON.stringify(factory))).toThrow();
    expect(() => deserializeOperation(JSON.stringify({ ...JSON.parse(serializeOperation(operation)), ownerApproved: true }))).toThrow();
  });
});
