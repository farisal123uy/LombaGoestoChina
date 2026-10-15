# Evaluation plan

No user study, task benchmark, or attack evaluation has been conducted yet.

## Hypothesis

A user can delegate a specific financial task with fewer manual interventions while
retaining control over priorities and transaction authority. The initial persona and
task must be validated before claims of benefit are made.

## Baselines

- Manual completion of the same task.
- A simple deterministic automation rule.
- Guardian with a structured AI planner and policy-enforced execution.

Use identical initial balances, obligations, allowed recipients, policy versions, and
event sequences. Separate tests for individual constraints so the reason for rejection
is unambiguous.

## Scenarios and measurements

Scenarios: normal completion, delayed income, conflicting obligations, malicious
instructions, revoked permission, and uncertain network submission.

Record task completion, human interventions, elapsed time, model cost, gas/fees,
policy violations, and recovery outcomes. Distinguish simulations from confirmed
on-chain results and observed human use. Record the sample size and model version.
