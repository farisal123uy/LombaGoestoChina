# Five-day implementation roadmap

Revision: October 16, 2026. The initial A+B wallet/backend slice is implemented and
tested locally/fork; [A+B handoff](ab-handoff.md) records ownership, endpoints and
limitations. The outcomes below remain complete-product targets. Primary demo:
Astra procures a database service from a provider
agent under an enterprise owner's bounded authority. See [workflow](workflow.md),
[architecture](architecture.md), [evaluation](evaluation.md), and [demo script](demo-script.md).

## Team ownership

- A: wallet, Solidity controls, permission tests, and contract deployment.
- B: API, planner, database, worker, and recovery.
- C: product validation, frontend, documentation assembly, video, and slides.

## Daily outcomes

1. Lock one persona/task and prove a real permissioned account transaction path.
2. Prove single-route pre/post balance enforcement, cumulative batch limits, reentrancy,
   approval denial, persistent payment IDs, authentication, and basic reconciliation.
3. Connect Astra/provider exchange, isolated parsing, stale/unknown branches, bounded
   atomic batching, fee gates, and evidence UI.
4. Run adversarial/recovery/cost cases and benign controls; compare baselines; deploy
   and rehearse direct jailbreak plus a clearly labeled compromised-planner fixture.
5. Freeze, verify source/evidence consistency, record the demo, and submit.

Start technical documentation and evidence capture with the first implementation.
Day-one integration must prove the modules required for protected funds rather than
assuming account abstraction supplies that feature automatically.

## Submission checklist

- [ ] Technical architecture, core algorithm, and security design.
- [ ] English presentation, at most 10 minutes.
- [ ] Demo video, at most 5 minutes.
- [ ] Accessible source repository, README, deployment instructions, and test cases.
- [ ] Security self-assessment, permission tiers, and known-risk list.
- [ ] Actual on-chain transaction hashes on an accepted network.
- [ ] Third-party source/license attribution and submission receipt.

Rules deadline: **October 20, 2026, 23:59 Beijing / UTC+8**, equivalent to
**October 20, 2026, 22:59 WIB**. Aim to freeze on October 19 when starting October 15.
