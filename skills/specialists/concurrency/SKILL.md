---
name: specialist-concurrency
description: Shared state and parallel execution. Use when the change touches shared mutable state, locks, or can run alongside other tasks/processes.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

# Concurrency specialist

Shared state and parallel execution. Use when the change touches shared mutable state, locks, or can run alongside other tasks/processes.

- Identify shared mutable state and who else can touch it concurrently.
- Check for races: two actors reading-then-writing the same state without coordination.
- Check locking: what is the lock, what does it protect, and can it deadlock with another lock in the system.
- Check ordering assumptions that concurrent execution could violate.
- Check retry safety: is a retried operation idempotent, or can it double-apply.
- Check reentrancy if the same code path can be invoked recursively or by a retry mid-flight.
- For ForgeSpec tasks specifically: does this task declare the touches/locks needed so it cannot silently conflict with a parallel task.

This specialist returns reasoning and findings for the parent workflow (forge-explore or forge-propose) to weigh and merge into change.md. It never creates its own standalone document.
