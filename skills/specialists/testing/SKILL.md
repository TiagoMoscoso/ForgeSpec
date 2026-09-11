---
name: specialist-testing
description: Requirement-to-evidence mapping. Use on every change; skip only sub-checks that are genuinely not relevant.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

# Testing specialist

Requirement-to-evidence mapping. Use on every change; skip only sub-checks that are genuinely not relevant.

- Map each mandatory requirement to at least one verifiable acceptance criterion.
- Choose the right level per requirement: unit, integration, or manual/external verification — do not default to unit tests for everything.
- Require failure-path coverage, not just the happy path.
- Flag requirements whose only proof would be a human/manual check, and say so explicitly rather than hiding it in acceptance text.
- Distinguish deterministic evidence (a test the CLI can run) from a claim that needs semantic review.
- Watch for tests that would pass even if the requirement were violated (weak assertions, over-mocking the behavior under test).
- Do not recommend a test whose only purpose is a coverage number.

This specialist returns reasoning and findings for the parent workflow (forge-explore or forge-propose) to weigh and merge into change.md. It never creates its own standalone document.
