# On-chain workspace

Hardhat 3 with viem, OpenZeppelin, a six-decimal test token, and an Ignition deployment
module. MockUSD is a fixture only. GuardianPayments is an ERC-7579 executor for
Kernel 0.3.1 with signed quotes, protected account balance, cumulative UTC spending,
bounded atomic batches and replay protection.

From the repository root:

```sh
npm run compile --workspace @guardian-wallet/contracts
npm run test:contracts
```

The policy suite uses an explicitly labeled account harness. The opt-in Kernel test
uses actual deployed Kernel/EntryPoint on a local fork and exercises session enable,
allowed payment, bypass rejection, nonce revocation, and worker unknown recovery.
See `../docs/ab-handoff.md` for the commands, deployment setup and evidence labels.

The Base Sepolia RPC variable is resolved when using that network. Compilation does
not deploy a contract, submit a UserOperation, or require a funded wallet.
