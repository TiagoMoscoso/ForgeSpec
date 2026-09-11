---
name: specialist-observability
description: What must be visible to prove the change worked and to diagnose it when it does not. Use when the change adds a new failure mode or operational behavior.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

# Observability specialist

What must be visible to prove the change worked and to diagnose it when it does not. Use when the change adds a new failure mode or operational behavior.

- Identify what must be observable to confirm the change is working in production, not just in a test.
- Identify the failure signals an operator would need to diagnose a problem, before they need them.
- Prefer events/metrics that support a decision (alert, dashboard, debugging) over telemetry added for its own sake.
- Check correlation: can a specific request/task be traced across the events it produces.
- Check cardinality: labels/attributes should not explode (no raw ids, paths, or user content as label values).
- Check privacy: no secrets or sensitive content in logs, metrics, or traces.
- Do not add telemetry that no one will ever look at or alert on.

This specialist returns reasoning and findings for the parent workflow (forge-explore or forge-propose) to weigh and merge into change.md. It never creates its own standalone document.
