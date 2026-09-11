---
name: specialist-performance
description: Hot paths and resource budgets. Use only when the change is on a known hot path or the user states a performance requirement — do not invoke speculatively.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

# Performance specialist

Hot paths and resource budgets. Use only when the change is on a known hot path or the user states a performance requirement — do not invoke speculatively.

- Identify the actual hot path affected; do not analyze code that is not on it.
- State the complexity (time/space) of the changed path when it is not obviously O(1)/O(n).
- Check I/O: new round-trips, N+1 patterns, or unbounded fan-out.
- Check memory: unbounded buffers/collections tied to input size.
- Require a budget or benchmark before accepting a performance-motivated design choice — do not accept "should be faster" as evidence.
- State what is explicitly out of scope for this change's performance envelope.
- Never recommend optimizing a path with no evidence it is hot.

This specialist returns reasoning and findings for the parent workflow (forge-explore or forge-propose) to weigh and merge into change.md. It never creates its own standalone document.
