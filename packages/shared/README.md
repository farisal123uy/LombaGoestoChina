# Shared contracts between applications

Contains development-chain metadata and legacy interfaces, plus strict payment
quote/plan schemas, bounded integer-unit validation and separate payment-task/operation
types. Financial permission checks are implemented in wallet/Guardian, not by schema
validation alone. `payments.ts` is the API/UI integration contract for the A+B slice.
