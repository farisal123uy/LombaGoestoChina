import "dotenv/config";
import { configVariable, defineConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

export default defineConfig({
  plugins: [hardhatToolboxViem],
  // Execution semantics for this one pinned local test fork, not a full
  // historical Base Sepolia hardfork schedule or a fee-economics simulation.
  chainDescriptors: {
    84532: { name: "Base Sepolia Kernel test fork", chainType: "op", hardforkHistory: { isthmus: { blockNumber: 48189742 } } },
  },
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhatMainnet: { type: "edr-simulated", chainType: "l1" },
    kernelFork: {
      type: "edr-simulated", chainType: "op", chainId: 84532,
      forking: { url: process.env.KERNEL_FORK_RPC_URL?.trim() || "https://sepolia.base.org", blockNumber: 48189742 },
    },
    baseSepolia: {
      type: "http",
      chainType: "op",
      chainId: 84532,
      url: configVariable("BASE_SEPOLIA_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
});
