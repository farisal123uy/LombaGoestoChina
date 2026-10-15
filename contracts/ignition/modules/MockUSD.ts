import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MockUSDModule", (module) => {
  const recipient = module.getAccount(0);
  const token = module.contract("MockUSD", [recipient]);
  return { token };
});
