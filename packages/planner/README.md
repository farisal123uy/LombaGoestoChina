# AI planner

Draft planner boundary and AI SDK dependencies are provided. Model invocation, output
schemas, trusted recipient resolution, and policy-aware planning are not implemented.

Implement the `Planner` interface with structured output. Keep signing credentials out
of this runtime. Evaluate malformed output and untrusted instructions before connecting
the planner to execution.
