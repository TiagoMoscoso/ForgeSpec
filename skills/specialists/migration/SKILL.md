---
name: specialist-migration
description: Forward/backward compatibility of persisted state and deployments. Use when the change alters schema, data shape, or deployment sequencing.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

# Migration specialist

Forward/backward compatibility of persisted state and deployments. Use when the change alters schema, data shape, or deployment sequencing.

- Define the forward migration steps and whether they can run online.
- Define the rollback path; a migration with no rollback story is a material question, not a detail.
- Decide expand/contract phasing explicitly; do not leave dual-read/dual-write as an unstated assumption.
- Check version skew: can an old client/consumer still function mid-rollout.
- Check deployment order dependencies between this change and anything it depends on or is depended on by.
- State what happens to existing data that predates the change.

This specialist returns reasoning and findings for the parent workflow (forge-explore or forge-propose) to weigh and merge into change.md. It never creates its own standalone document.
