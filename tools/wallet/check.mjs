import { createPublicClient, http, formatEther, getAddress } from "viem";
import { baseSepolia } from "viem/chains";
import { readEnvironment, validateServiceValue, verifyProject } from "../services/config.mjs";

await verifyProject();
const api = await readEnvironment("api");
if (!api.OWNER_ADDRESS) {
  console.log(JSON.stringify({ status: "pending_owner_wallet", nextStep: "Buat wallet owner, lalu isi alamat publik melalui npm.cmd run setup:services -- --only wallet." }, null, 2));
} else if (!validateServiceValue("address", api.OWNER_ADDRESS)) {
  console.error("INVALID_PUBLIC_OWNER_ADDRESS");
  process.exitCode = 1;
} else {
  try {
    const client = createPublicClient({ chain: baseSepolia, transport: http(api.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org", { timeout: 12000, retryCount: 0 }) });
    if (await client.getChainId() !== 84532) throw new Error("WRONG_CHAIN");
    const owner = getAddress(api.OWNER_ADDRESS);
    const block = await client.getBlock();
    const [balance, code] = await Promise.all([
      client.getBalance({ address: owner, blockNumber: block.number }),
      client.getCode({ address: owner, blockNumber: block.number }),
    ]);
    console.log(JSON.stringify({
      status: "owner_address_read_verified", chainId: 84532, network: "Base Sepolia", ownerAddress: owner,
      balanceEth: formatEther(balance), balanceWei: balance.toString(),
      accountKind: !code || code === "0x" ? "eoa" : code.startsWith("0xef0100") ? "delegated_eoa" : "contract_needs_owner_signer_review",
      gasFunding: balance > 0n ? "balance_present_deployment_cost_still_requires_estimation" : "zero_native_balance_can_use_verified_sponsored_useroperations",
      checkedBlock: block.number.toString(), explorer: `https://sepolia.basescan.org/address/${owner}`,
      signingCapabilityVerified: false, transactionsSent: 0,
    }, null, 2));
  } catch {
    // Provider errors can carry credential-bearing URLs; never echo them.
    console.error("OWNER_WALLET_READ_CHECK_FAILED_CHECK_RPC_AND_NETWORK");
    process.exitCode = 1;
  }
}
