---
name: forge-archive
description: Archive a ForgeSpec task through the fail-closed evidence gate, then close the change when ready.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

Verify delivery before accepting a task. The question this skill answers is: is this genuinely good enough to accept as delivered — not "did the agent say it's done."

The CLI owns evidence freshness, validator execution, state transitions, waivers, and the archive/close mechanics themselves. This skill owns the semantic judgment the CLI cannot make: whether the implementation actually satisfies the requirement, stayed in scope, and holds up architecturally.

## Gather what you need

1. `forgespec agent context <task> --json` and `forgespec tool run evidence-inspection --task <task> --json` — the linked requirement(s), acceptance criteria, and what evidence already exists.

## Review across the dimensions that matter here

Not every dimension applies to every task; assess the ones that do.

**Correctness**
- Does the implementation actually satisfy the linked requirement(s)?
- Are the acceptance criteria genuinely met — including edge and failure cases, not just the happy path implied by the task title?
- Would this survive a realistic adversarial input, not just the example in the requirement?

**Scope**
- Did the implementation stay inside this task and this change?
- Was anything unrelated modified?
- Did the scope quietly expand beyond what the task described?

**Architecture**
- Does the implementation follow the direction change.md's Architecture/Decisions sections committed to?
- Did it introduce coupling that wasn't there before?
- Did it bypass an abstraction the codebase already uses?
- Does it live in the module that actually owns this behavior?

**Code quality**
- Clear responsibilities and readable naming.
- Manageable complexity.
- No obvious duplication of existing capability.
- No unnecessary cleverness.
- Appropriate error handling.
- Appropriate resource lifetime (nothing leaked, nothing double-freed/double-closed).

**Tests** — evaluate quality, not presence.
- Do the tests actually prove the requirement, with meaningful assertions?
- Do they cover the failure cases the requirement calls for?
- Were any tests weakened to make the implementation pass, rather than the implementation fixed to pass real tests?
- Is anything requirement-relevant left untested?
- Is the test level (unit/integration/manual) actually appropriate?
- Would the test still pass if the requirement were violated? If so, it isn't proving anything.

**Security** (when relevant)
- Input validation, authn/authz, secret handling.
- Trust boundaries, command execution, path handling.
- Injection risk, privilege boundaries, sensitive logging.

**Concurrency/reliability** (when relevant)
- Races, locking, atomicity, ordering.
- Retries and idempotency.
- Partial failure, recovery, and restart behavior.

**Compatibility** (when relevant)
- API compatibility.
- Persisted-data compatibility.
- Older clients and expected external behavior.

**Complexity**
- Challenge unnecessary abstraction.
- Challenge speculative extensibility the requirement didn't ask for.
- Challenge a diff that's large relative to what the requirement actually needed.

## Findings need a severity and an action, not a vibe

Classify every finding by severity:
- **CRITICAL** — a real defect against a requirement, acceptance criterion, or a hard boundary (security, data loss, scope). Blocks archive.
- **WARNING** — a real problem that doesn't block delivery but should be tracked and fixed.
- **SUGGESTION** — an optional improvement; the reviewer's opinion, not a defect.

Never downgrade a real correctness problem to WARNING because the implementation is mostly there — "mostly correct" is not correct. Make every finding actionable: name the requirement or acceptance criterion it violates and what would fix it.

Vague: "Consider improving this."
Actionable: "REQ-AUTH-003 requires expired tokens to be rejected, but TokenValidator accepts tokens when `exp` is missing. Add explicit `exp` validation and a regression test."

If any archive validator is `spec-compliance` or `code-review` (or another configured semantic validator), write your findings as the review JSON this rubric produces and submit it: `forgespec review submit <task> --validator <name> --file <review.json>`. Critical findings must be zero before the archive gate will accept that validator.

Semantic review complements deterministic evidence — it never replaces build, test, lint, or typecheck results, and it never substitutes for evidence that's actually stale.

## Run the gate, don't bypass it

`forgespec archive <task> --json`. This fails closed: there is no `--yes` or blanket bypass. The only escape hatch is `--waiver <validator> --reason <auditable reason>`, used only for a deliberate, reasoned decision to skip a specific validator — never to make a real failure disappear, and never claim a validator "passed" when it was actually waived.

## Close the change when it's actually ready

If `forgespec ready --json` reports `closeReady`, merge requirements into `forgespec/specs/` using `runtime/spec-sync.json`, then `forgespec close --change <id> --json`. Before closing, check that:
- every mandatory requirement's stable ID is actually present in the durable specs (`close` enforces this, but read the merge rather than trusting it blindly)
- no requirement text was lossy-summarized away during the merge
- the specs read coherently on their own, not just as a diff against change.md

Do not move files by hand. Archive and close are quality gates, not filesystem operations.
