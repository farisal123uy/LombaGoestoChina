import { developmentChain } from "@guardian-wallet/shared";

export interface WalletProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, callback: () => void): void;
  removeListener?(event: string, callback: () => void): void;
}
export const textToHex = (text: string) => `0x${Array.from(new TextEncoder().encode(text), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
export function walletProvider() {
  const wallet = (window as unknown as { ethereum?: WalletProvider }).ethereum;
  if (!wallet) throw new Error("Install or enable MetaMask, then reload this page.");
  return wallet;
}
export async function ensureBaseSepolia(wallet: WalletProvider) {
  try { await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14a34" }] }); }
  catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await wallet.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x14a34", chainName: "Base Sepolia", rpcUrls: ["https://sepolia.base.org"], nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, blockExplorerUrls: [developmentChain.explorerUrl] }] });
    await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14a34" }] });
  }
}
export function tokenAmount(value: string) {
  const amount = BigInt(value), base = BigInt(1000000);
  return `${amount / base}.${(amount % base).toString().padStart(6, "0").slice(0, 2)}`;
}
