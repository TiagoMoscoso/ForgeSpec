---
name: specialist-data
description: Schema, ownership, and consistency. Use when the change adds or changes persisted state, a schema, or a cache.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

# Data specialist

Schema, ownership, and consistency. Use when the change adds or changes persisted state, a schema, or a cache.

- Identify the source of truth for the data this change touches.
- State the invariants the data must hold, and who enforces them.
- Identify the consistency model (strong, eventual, read-your-writes) and whether the change assumes a stronger one than it gets.
- Check transaction boundaries: what must commit or fail together.
- Check serialization/format compatibility for anything persisted or transmitted.
- Check cache semantics: invalidation, staleness window, and who owns cache correctness.
- Check idempotency and duplication/loss risk on retry.
- Flag any migration implication and hand off detail to the migration specialist rather than restating it.

This specialist returns reasoning and findings for the parent workflow (forge-explore or forge-propose) to weigh and merge into change.md. It never creates its own standalone document.
