import { encodeAbiParameters, keccak256, toBytes, type Address } from "viem";
import { serviceCatalog, type DeliveryReceipt, type OfferId } from "@guardian-wallet/shared";

export const providerId = keccak256(toBytes("guardian-demo-database-provider:v1"));
export function invoiceId(account: Address, requestId: string) {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "string" }], [account, requestId]));
}
export function getServiceOffer(id: OfferId) {
  const offer = serviceCatalog.find((item) => item.id === id);
  if (!offer) throw new Error("UNKNOWN_SERVICE_OFFER");
  return offer;
}
export function serviceHash(id: OfferId) { return keccak256(toBytes(JSON.stringify(getServiceOffer(id)))); }
export function deliveryTypedData(chainId: number, guardian: Address, receipt: Omit<DeliveryReceipt, "signature">) {
  return {
    domain: { name: "GuardianProviderDelivery", version: "1", chainId, verifyingContract: guardian },
    primaryType: "ServiceDelivery" as const,
    types: { ServiceDelivery: [
      { name: "account", type: "address" }, { name: "invoiceId", type: "bytes32" }, { name: "paymentId", type: "bytes32" },
      { name: "serviceHash", type: "bytes32" }, { name: "namespaceId", type: "string" }, { name: "transactionHash", type: "bytes32" },
      { name: "readyAt", type: "uint48" }, { name: "expiresAt", type: "uint48" },
    ] } as const,
    message: receipt,
  };
}
