---
name: forge-propose
description: Write and seal a ForgeSpec change.md contract. Use when the user wants to specify a change.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

Architect-grade convergence before implementation. The goal is not "produce a document" — it's a coherent, implementation-ready change contract with no material design ambiguity hidden behind prose.

The only artifact is `forgespec/changes/<id>/change.md`. Do not create `proposal.md`, `design.md`, or `tasks.md` — if the repository doesn't already use those files for a different purpose, ForgeSpec never wants them.

## Ground the proposal in this repository

1. Inspect relevant source, tests, docs, and `forgespec/specs/` via `forgespec tool run repository-inspection --json` as needed. A proposal that reads as generic best-practice advice rather than something grounded in this codebase is not ready to write down.
2. Identify integration boundaries (what calls this, what this calls) and external/manual dependencies (credentials, live services, hardware) before assuming a clean implementation path.
3. Look for a similar capability already implemented elsewhere in the repository; reuse its shape unless there's a stated reason not to.

## Choose specialists by what the change actually is, not by habit

`workflow.propose.skills` in config names the default specialists to run (`forgespec skill <name> --json`), but that default is a floor, not a ceiling. Reason about which additional specialists this specific change calls for and run those too — the same command works for any registered id (`forgespec skill` with no argument lists them). Do not invoke a specialist that has nothing to say about this change; forcing every specialist on every change dilutes the ones that matter.

Rough correspondence (use judgment, not a lookup table):
- Authentication/authorization feature → architecture, flow, testing, security, data.
- Schema or storage migration → architecture, data, migration, testing.
- UI-only preference toggle → frontend, flow, testing.
- A new concurrent worker/background process → architecture, flow, concurrency, testing, observability.

Specialists return reasoning for you to weigh, not text to paste verbatim. They must never produce their own Markdown file — merge what's actually load-bearing into change.md and discard the rest.

## Reason across the dimensions that actually apply

Consider each of the following only where it's relevant to this change; do not force a section that has nothing to say. Silence on an irrelevant dimension is correct; silence on a relevant one is a gap.

**Architecture**
- Ownership boundaries: which module is responsible for this behavior, before and after.
- Cohesion/coupling: does the change strengthen one responsibility or smear it across modules.
- Fit with existing abstractions, and dependency direction (does anything now point the wrong way).
- Interface boundaries and lifecycle: what's public, what's internal, what starts/stops it.
- Extension points: does this reuse one, or does it need a new one.
- Deployment and operational implications, and any added operational complexity.

**Behavior**
- Happy path, described as observable behavior, not steps.
- Failure path(s), invalid input, and edge conditions.
- Cancellation/retry behavior, where the operation isn't instantaneous.
- Idempotency, where the operation can be repeated.
- Persistence semantics and exactly what the user/caller observes.

**Data/state**
- Source of truth and state ownership.
- Consistency model, and whether the change assumes a stronger one than it gets.
- Persistence, migration, and backward compatibility.
- Concurrency implications on the same state.

**Reliability**
- Partial failure and restart behavior.
- Timeouts and retries.
- Cleanup/resource lifetime on both success and failure.
- Degraded mode, if the system should keep working in a reduced capacity.

**Security** (when relevant)
- Trust boundaries the change crosses.
- Authentication and authorization.
- Secret handling and unsafe input.
- Privilege boundaries and auditability.

**Testing**
- Which requirements need unit tests, which need integration tests, which need manual/external verification.
- What evidence would actually prove each requirement is met — not just that code was written.

**Compatibility** (when relevant)
- Existing consumers and APIs.
- Persisted data and older versions.
- Migration and rollback.

## Distinguish a minor detail from a material question

A **minor implementation detail** can be decided later without changing behavior, architecture, the data model, or acceptance criteria — leave it to `/forge-exec` and don't block on it.

A **material question** would affect any of the following:
- public behavior
- architecture
- the data model
- compatibility
- security
- acceptance criteria
- how the work decomposes into tasks

Material questions must be resolved, or explicitly converted into a documented precondition, before sealing. Never invent an assumption to make the document look complete: an unstated assumption dressed up as a fact is worse than an open question, because it hides the risk instead of surfacing it.

If a material question can only be resolved by external access, a spike, a benchmark, a user decision, specific hardware, or a live environment, do not fabricate an answer. Either get the answer, or record it as an explicit precondition/spike and leave the question open — sealing stays blocked either way until it's resolved.

## Write requirements that are actually testable

Every requirement needs a stable ID, describes observable or contractually relevant behavior, and is testable/verifiable — not a restatement of an implementation step. Include acceptance conditions, and failure/edge behavior where it matters.

Poor: `REQ-001: Create AuthService.`
Better: `REQ-001: The system must reject expired tokens and invalid signatures before creating an authenticated session.`

The first describes a file to create; the second describes behavior someone could actually verify without reading the implementation.

## Capture material decisions, not just state them

For a decision that materially shapes the change, record it as a `### DEC-<id>` entry in change.md's Decisions section with: the decision itself, the rationale, alternatives considered (when there genuinely were meaningful ones), the tradeoff, and the consequences. Skip this ceremony for trivial choices — not every line of the implementation needs an ADR.

For example:
```
### DEC-001: Validate tokens in the existing AuthMiddleware, not a new service

Decision: Add expiry/signature validation to AuthMiddleware.validate().
Rationale: AuthMiddleware already owns every request's auth decision; a
new service would duplicate that ownership.
Alternatives considered: a standalone TokenValidator service — rejected,
it would need the same session state AuthMiddleware already holds.
Tradeoff: AuthMiddleware grows one more responsibility, but stays the
single place auth decisions are made.
Consequences: no new deployable, no new interface boundary to maintain.
```

## Write the contract

Write exactly one file: `forgespec/changes/<id>/change.md`, with YAML frontmatter (`id`, `title`), then Intent, Scope, Non-goals (when useful), Architecture, Requirements (`### REQ-...` blocks with body text, `Acceptance:` bullets, and `Kind: mandatory|optional`), Decisions (`### DEC-...` blocks), and Open questions (`None.` once genuinely resolved).

## Review the whole document before sealing

Before running the seal command, review the completed change.md as if someone else wrote it, checking for:
- internal contradictions between sections
- a stated non-goal that a requirement actually violates
- a requirement with no architectural grounding, or an architecture decision no requirement depends on
- an acceptance condition that can't actually be verified
- an unresolved assumption disguised as a stated fact
- a missing failure path or compatibility implication for something that clearly needs one
- unnecessary complexity relative to what the requirements actually ask for
- a capability that already exists in the repository or in `forgespec/specs/`

Only after that self-review is clean should you run `forgespec propose seal --change <id> --json`. If it fails, fix the contract rather than working around the failure — the checks it runs (non-empty intent/scope, no open questions, every requirement has text and acceptance) are the same structural bar the self-review above should already have caught. Refuse to seal while a material question remains open.
