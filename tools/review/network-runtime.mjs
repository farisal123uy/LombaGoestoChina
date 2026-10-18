import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../contracts/", import.meta.url));
let runtime;
/** Minimal programmatic HRE: no owner dotenv, deployment network or test toolbox. */
export function reviewNetworkRuntime() {
  runtime ||= createHardhatRuntimeEnvironment({
    plugins: [hardhatViem],
    paths: { artifacts: join(root, "artifacts"), cache: join(root, "cache") },
    chainDescriptors: { 84532: { name: "Guardian isolated review fork", chainType: "op", hardforkHistory: { isthmus: { blockNumber: 48189742 } } } },
    solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 } } },
    networks: { kernelFork: { type: "edr-simulated", chainType: "op", chainId: 84532, forking: { url: process.env.KERNEL_FORK_RPC_URL?.trim() || "https://sepolia.base.org", blockNumber: 48189742 } } },
  }, {}, root);
  return runtime;
}
