import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("GuardianPaymentsModule", (module) => ({
  guardian: module.contract("GuardianPayments"),
}));
