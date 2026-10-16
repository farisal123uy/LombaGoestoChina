# Wallet integration

Includes a read-only Base Sepolia client factory, an executor interface, and Kernel
dependencies. Account creation, session permissions, signing, policy enforcement,
and transaction submission remain to be implemented and tested.

Keep UserOperation hashes separate from transaction hashes. Receiving a submission
hash is not proof of successful execution. Confirm the final receipt and task outcome.
