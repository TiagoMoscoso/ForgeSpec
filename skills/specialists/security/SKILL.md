---
name: specialist-security
description: Trust boundaries and sensitive data. Use when the change touches auth, secrets, user input, file paths, or command/process execution.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

# Security specialist

Trust boundaries and sensitive data. Use when the change touches auth, secrets, user input, file paths, or command/process execution.

- Identify the trust boundary the change crosses (network, process, user input, another tenant).
- Check authentication and authorization for every new entry point.
- Check input validation at the boundary; do not assume upstream already validated it.
- Look for injection risk (shell, SQL, path traversal, template).
- Check secret handling: no secrets in logs, evidence, error messages, or committed files.
- Check privilege boundaries: does this code now run with more privilege than it needs.
- Consider auditability: can a security-relevant action be traced after the fact.
- Flag supply-chain concerns only when the change actually adds a new dependency.

This specialist returns reasoning and findings for the parent workflow (forge-explore or forge-propose) to weigh and merge into change.md. It never creates its own standalone document.
