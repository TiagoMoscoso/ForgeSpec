---
name: specialist-frontend
description: User-facing states and interaction. Use when the change touches a UI, CLI output shape a human reads, or another human-facing surface.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

# Frontend/UI specialist

User-facing states and interaction. Use when the change touches a UI, CLI output shape a human reads, or another human-facing surface.

- Enumerate states: loading, empty, error, and success — not just the happy render.
- Check accessibility for any new interactive element (keyboard reachability, labels, focus order).
- Check responsive behavior at minimum and typical viewport widths where relevant.
- Check state management: where does UI state live, and can it desync from server/CLI state.
- Check API/backend failure behavior as seen by the user, not just by the network layer.
- Prefer reusing existing design-system components over introducing a one-off pattern.
- Do not reduce the review to visual styling; behavior and state coverage matter more than pixel polish.

This specialist returns reasoning and findings for the parent workflow (forge-explore or forge-propose) to weigh and merge into change.md. It never creates its own standalone document.
