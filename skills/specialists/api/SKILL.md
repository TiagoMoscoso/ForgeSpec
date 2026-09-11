---
name: specialist-api
description: External contracts. Use when the change adds or changes a public interface, wire format, or CLI/HTTP surface.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

# API specialist

External contracts. Use when the change adds or changes a public interface, wire format, or CLI/HTTP surface.

- Check backward compatibility for existing callers; a breaking change must be explicit, not incidental.
- Check versioning strategy if the contract changes shape.
- Define the error contract: what error is returned for each failure mode, not just the success shape.
- Check idempotency and pagination if the endpoint/command can be retried or returns a list.
- Check that the contract is fully specified by change.md requirements, not left to the implementation to decide.

This specialist returns reasoning and findings for the parent workflow (forge-explore or forge-propose) to weigh and merge into change.md. It never creates its own standalone document.
