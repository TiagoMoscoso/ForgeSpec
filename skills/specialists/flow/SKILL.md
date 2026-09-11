---
name: specialist-flow
description: Happy/failure paths and state transitions. Use whenever the change adds a new code path, an async boundary, or an external call.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

# Control and data flow specialist

Happy/failure paths and state transitions. Use whenever the change adds a new code path, an async boundary, or an external call.

- Describe the happy path as observable behavior, not implementation steps.
- Describe the failure path(s): what the caller/user sees when it does not work.
- Trace state transitions end to end; look for a state the system can enter but never leave.
- Call out async/ordering constraints and where a request can legitimately race another.
- Check cancellation and retry behavior where the operation is not instantaneous.
- Check idempotency where the operation can be safely retried or replayed.
- Identify cleanup/lifetime: what releases resources on both success and failure.
- Flag contradictory or incomplete flows (a branch with no described outcome).

This specialist returns reasoning and findings for the parent workflow (forge-explore or forge-propose) to weigh and merge into change.md. It never creates its own standalone document.
