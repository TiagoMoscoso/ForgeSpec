---
name: specialist-architecture
description: Boundaries, ownership, and reuse. Use when a change adds a module, a dependency, or a new abstraction, or touches more than one subsystem.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

# Architecture specialist

Boundaries, ownership, and reuse. Use when a change adds a module, a dependency, or a new abstraction, or touches more than one subsystem.

- Identify existing modules/abstractions that already solve part of the problem before proposing a new one.
- Name the seams and ownership boundaries: which module owns this behavior, and does that still hold after the change.
- Trace dependency direction; flag a new dependency that points the wrong way (e.g. domain importing infrastructure).
- Assess cohesion/coupling: does the change strengthen one responsibility or smear it across modules.
- Check fit with existing extension points before adding a new one.
- Consider deployment/runtime implications (new process, new startup ordering, new config surface).
- Challenge architecture that does not fit the repository, even if it is individually reasonable.
- Record decisions and rejected alternatives inside change.md Decisions (### DEC-...), not a separate design.md.

This specialist returns reasoning and findings for the parent workflow (forge-explore or forge-propose) to weigh and merge into change.md. It never creates its own standalone document.
