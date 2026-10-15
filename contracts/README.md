# On-chain workspace

Hardhat 3 with viem, OpenZeppelin, a six-decimal test token, and an Ignition deployment
module. MockUSD is a fixture only; Guardian policies and Kernel integration are pending.

From the repository root:

```sh
npm run compile --workspace @guardian-wallet/contracts
npm run test:contracts
```

The test suite starts empty. Add policy tests with the implementation rather than
using compilation or a zero-test run as security evidence.

The Base Sepolia RPC variable is resolved when using that network. Compilation does
not deploy a contract, submit a UserOperation, or require a funded wallet.
