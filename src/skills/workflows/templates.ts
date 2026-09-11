export interface SkillTemplate {
  id: string;
  name: string;
  description: string;
  instructions: string;
}

export const WORKFLOW_IDS = ['explore', 'propose', 'forge', 'exec', 'archive'] as const;
export type WorkflowId = (typeof WORKFLOW_IDS)[number];

export function getExploreInstructions(): string {
  return `Optional thinking mode. Compare approaches and surface risks. Do not implement or write runtime files.

Use this mode when the right approach is unclear, when the user's first idea might not be the best one, or when you need to understand a subsystem before proposing a change to it. Skip it when the change is already well understood — go straight to \`/forge:propose\`.

## Ground yourself in the real repository first

1. \`forgespec tool run repository-inspection --json\` (and \`forgespec tool run git-diff --json\` if recent history is relevant).
2. Read the actual source, tests, and \`forgespec/specs/\` for the area under discussion before forming an opinion. An opinion formed before reading the code is a guess, not exploration.
3. Look for an existing abstraction that already does part of what's being asked before proposing a new one. A second implementation of an existing concept is a defect, not a feature.

## Map the system, not just the symptom

- Trace the control flow and data flow through the area that would change: where does a request/value enter, what transforms it, where does it end up.
- Identify ownership boundaries: which module is actually responsible for the behavior in question, and does the user's framing of the problem match where the responsibility really lives.
- Identify coupling and hidden dependencies: what else reads or writes the same state, config, or file; what breaks if this module's contract shifts even slightly.
- Surface failure modes the current code already handles (and how) so a proposed change doesn't quietly regress them.
- Identify compatibility constraints: existing callers, persisted data shapes, or external consumers that a change could break.

## Separate what you know from what you're guessing

Label your own findings, out loud, as one of:
- **Observed fact** — you read it in the code, tests, docs, or history.
- **Reasonable inference** — a conclusion that follows from observed facts but wasn't stated directly; say what it's based on.
- **Unresolved question** — something you cannot determine by reading the repository.

Never present an inference as a fact, and never quietly resolve an unresolved question with a guess. If a question is unresolved, say so and ask, or carry it forward into propose's open-questions list.

For example: "the handler retries three times" is a fact if you read it in the code; "retries are meant to survive a flaky network call" is an inference from that fact and the surrounding context, not something the code states; "what should happen after the third retry fails" is an unresolved question if nothing in the repository answers it.

## Take a position when the evidence supports one

If the user's initial idea is workable but a clearly better option is supported by what you found in the repository (matches existing patterns, avoids a known failure mode, reuses an existing abstraction), say so directly and explain why — don't default to "either could work" when the repository evidence disagrees. Fake neutrality between a strong option and a weak one wastes the user's time.

When the choice is genuinely ambiguous, lay out the real options with concrete tradeoffs instead of a vague pros/cons list. Use whatever structure makes the comparison clearest — a short table, or something like:

\`\`\`
Option A
+ lower complexity, matches existing service-layer pattern
+ no new operational dependency
- does not support cross-process sharing if that turns out to matter

Option B
+ supports distributed state
- introduces an operational dependency (cache/queue) not otherwise in this codebase
- inconsistent with how every other module here manages state
\`\`\`

Or a flow sketch when the current vs. proposed shape is the actual point of confusion:

\`\`\`
CURRENT
Input -> Parser -> Domain Service -> Persistence

PROPOSED
Input -> Parser -> Domain Service -> Cache -> Persistence
\`\`\`

Don't force a diagram or table where a sentence would do; use them only when they make a real comparison easier to see.

## Ask only what the repository can't answer

Before asking the user anything, check whether the repository already answers it. Only ask questions that would materially change scope, behavior, architecture, compatibility, or acceptance criteria. Do not turn exploration into an interview — a long list of clarifying questions about things you could have checked yourself is a sign you didn't look hard enough. Stop asking once you have enough clarity to specify the change; more questions past that point just delay propose.

## Boundaries

- Never write or edit production code, tests, or runtime files in this mode.
- Never create \`forgespec/changes/<id>/change.md\` or any other change artifact here — that belongs to \`/forge:propose\`.
- Never mark anything as decided, done, or in progress; exploration produces understanding and a recommendation, not state.
- When the picture is clear enough to specify the change, stop and recommend \`/forge:propose\`, carrying forward your findings (facts, inferences, and any genuinely open questions) rather than re-deriving them there.`;
}

export function getProposeInstructions(): string {
  return `Architect-grade convergence before implementation. The goal is not "produce a document" — it's a coherent, implementation-ready change contract with no material design ambiguity hidden behind prose.

The only artifact is \`forgespec/changes/<id>/change.md\`. Do not create \`proposal.md\`, \`design.md\`, or \`tasks.md\` — if the repository doesn't already use those files for a different purpose, ForgeSpec never wants them.

## Ground the proposal in this repository

1. Inspect relevant source, tests, docs, and \`forgespec/specs/\` via \`forgespec tool run repository-inspection --json\` as needed. A proposal that reads as generic best-practice advice rather than something grounded in this codebase is not ready to write down.
2. Identify integration boundaries (what calls this, what this calls) and external/manual dependencies (credentials, live services, hardware) before assuming a clean implementation path.
3. Look for a similar capability already implemented elsewhere in the repository; reuse its shape unless there's a stated reason not to.

## Choose specialists by what the change actually is, not by habit

\`workflow.propose.skills\` in config names the default specialists to run (\`forgespec skill <name> --json\`), but that default is a floor, not a ceiling. Reason about which additional specialists this specific change calls for and run those too — the same command works for any registered id (\`forgespec skill\` with no argument lists them). Do not invoke a specialist that has nothing to say about this change; forcing every specialist on every change dilutes the ones that matter.

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

A **minor implementation detail** can be decided later without changing behavior, architecture, the data model, or acceptance criteria — leave it to \`/forge-exec\` and don't block on it.

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

Poor: \`REQ-001: Create AuthService.\`
Better: \`REQ-001: The system must reject expired tokens and invalid signatures before creating an authenticated session.\`

The first describes a file to create; the second describes behavior someone could actually verify without reading the implementation.

## Capture material decisions, not just state them

For a decision that materially shapes the change, record it as a \`### DEC-<id>\` entry in change.md's Decisions section with: the decision itself, the rationale, alternatives considered (when there genuinely were meaningful ones), the tradeoff, and the consequences. Skip this ceremony for trivial choices — not every line of the implementation needs an ADR.

For example:
\`\`\`
### DEC-001: Validate tokens in the existing AuthMiddleware, not a new service

Decision: Add expiry/signature validation to AuthMiddleware.validate().
Rationale: AuthMiddleware already owns every request's auth decision; a
new service would duplicate that ownership.
Alternatives considered: a standalone TokenValidator service — rejected,
it would need the same session state AuthMiddleware already holds.
Tradeoff: AuthMiddleware grows one more responsibility, but stays the
single place auth decisions are made.
Consequences: no new deployable, no new interface boundary to maintain.
\`\`\`

## Write the contract

Write exactly one file: \`forgespec/changes/<id>/change.md\`, with YAML frontmatter (\`id\`, \`title\`), then Intent, Scope, Non-goals (when useful), Architecture, Requirements (\`### REQ-...\` blocks with body text, \`Acceptance:\` bullets, and \`Kind: mandatory|optional\`), Decisions (\`### DEC-...\` blocks), and Open questions (\`None.\` once genuinely resolved).

## Review the whole document before sealing

Before running the seal command, review the completed change.md as if someone else wrote it, checking for:
- internal contradictions between sections
- a stated non-goal that a requirement actually violates
- a requirement with no architectural grounding, or an architecture decision no requirement depends on
- an acceptance condition that can't actually be verified
- an unresolved assumption disguised as a stated fact
- a missing failure path or compatibility implication for something that clearly needs one
- unnecessary complexity relative to what the requirements actually ask for
- a capability that already exists in the repository or in \`forgespec/specs/\`

Only after that self-review is clean should you run \`forgespec propose seal --change <id> --json\`. If it fails, fix the contract rather than working around the failure — the checks it runs (non-empty intent/scope, no open questions, every requirement has text and acceptance) are the same structural bar the self-review above should already have caught. Refuse to seal while a material question remains open.`;
}

export function getForgeInstructions(): string {
  return `Compile change.md into an executable task graph. This is not "split the work into pieces" — it's designing an execution structure that a set of agents (possibly running in parallel) can execute correctly.

The only artifact is \`forgespec/changes/<id>/plan.yaml\`. Do not persist an execution-order or progress Markdown file; \`forgespec waves --json\` is the derived view of execution order, always up to date, never hand-maintained.

## Ground tasks in the real repository

1. Read \`forgespec/changes/<id>/change.md\` and the actual repository state before drafting tasks — a task list produced from the contract alone, without checking what already exists, tends to invent unnecessary work or miss what's already partially done.
2. Reject placeholder tasks ("inspect the code", "understand the requirements") — every task must be a concrete unit of engineering work. \`forgespec forge\` already rejects these at compile time; don't rely on that as your quality bar, catch them yourself first.

## Design each task as one coherent responsibility

A good task has one coherent engineering responsibility, is sized for a single focused exec session, has requirement coverage, has objective acceptance conditions, and has a clear validation path. It does not mix unrelated architectural layers without necessity, is not split merely by file, is not artificially tiny, and is not so large that a failure is hard to diagnose.

Poor: "Implement backend changes" (too broad to diagnose on failure, mixes unrelated responsibilities).
Poor: "Edit file A" / "Edit file B" / "Edit file C" (split by file, not by responsibility — a reader can't tell what any one task is actually for).
Better: "Reject expired and unsigned tokens in AuthMiddleware" (one responsibility, one requirement, one clear pass/fail).

## Cover every mandatory requirement, justify every task

Every mandatory requirement in change.md must map to \`requirements: [...]\` on at least one task — \`forgespec forge\` enforces this (uncovered requirements and orphan tasks both fail compilation), so treat that as a real constraint to satisfy while drafting, not a check to fix after the fact. A task with no requirement should be an explicit, clearly-labeled enabling/infrastructure task (e.g. scaffolding a new module the requirement-bearing tasks depend on), not silently included as if it were required — and there should be no task that exists for no traceable reason at all.

## Depend on what's actually required, not what's convenient to serialize

Use \`depends_on\` only for a true dependency: task B cannot be correctly implemented or verified before task A exists. A "feels more natural in this order" preference is not a dependency — encoding it as one over-serializes the graph and kills parallelism for no correctness benefit.

Maximize safe parallelism. Tasks are good candidates to run in the same wave when they touch:
- separate subsystems
- independent files
- independent APIs
- independent tests
- no shared mutable infrastructure

Set \`depends_on_state\` deliberately: depending on a task reaching \`implemented\` is weaker (and faster to unblock) than requiring \`verified\`; use \`implemented\` only when that weaker guarantee is genuinely sufficient for the dependent task to proceed correctly.

## Declare real conflicts so parallel execution stays safe

Two tasks that would otherwise run in parallel but actually conflict must say so through \`touches\` and \`locks\` — overlapping \`touches\` globs or a shared \`locks\` entry are what the CLI uses to detect a conflict. Consider each of these as a real conflict source:
- overlapping files
- shared configuration
- a database schema
- generated code
- a shared external environment
- the same named lock/resource
- the same integration surface

Do not claim two tasks are independent when their \`touches\` would obviously collide, and do not add a lock "just in case" for tasks that don't actually share a resource — that serializes work that could have run in parallel.

## Represent external and manual prerequisites explicitly

A task that needs any of the following before it can start should declare it through \`prerequisites\` (\`env\`/\`manual\`/\`command\`), not bury it in the task description where \`forgespec agent preflight\` can't check it and a future exec will discover it the hard way:
- a live service
- credentials
- specific hardware
- a manual approval
- an external environment
- manual validation that can't be automated

## Decide test placement deliberately

Do not automatically create a separate "write tests" task. Tests that prove a task's own acceptance criteria belong on that task. Create a separate test/integration task only when there's a genuine architectural reason (e.g. an integration suite that spans multiple tasks' output and can't be attributed to any single one).

## Assign validators that actually verify the task, not by default

Pick a credible verification path for each task rather than assigning validators mechanically — for example:
- focused tests, for a task with behavioral acceptance criteria
- \`build\`/\`typecheck\`, for a task that's mostly structural
- an integration test, when the acceptance criteria span more than one component
- \`code-review\` or \`spec-compliance\` (semantic validators), when the task needs judgment a deterministic check can't apply
- manual/external verification, when the task genuinely requires it — say so explicitly rather than inventing an automated check that can't exist

\`architecture-review\`, \`security-review\`, \`spec-compliance\`, and \`code-review\` are semantic validators: they gate archive through a submitted review, not through \`exec finish\`, so only assign them where the task's own review actually needs that scrutiny. A spike or pure manual-verification task may credibly need no automated validator at all.

## Review the whole graph before compiling

Before running \`forgespec forge --change <id> --json\`, check the drafted graph for:
- an uncovered mandatory requirement
- duplicate tasks covering the same ground
- a dependency cycle
- unnecessary serialization that could safely be removed
- unsafe parallelism (two tasks that will actually conflict but aren't marked as such)
- a task that's too broad to diagnose on failure
- a task that's too granular to be worth a session
- missing validation for a task whose acceptance criteria need it
- a missing external/manual prerequisite
- implementation work not justified by any requirement or a stated enabling reason
- scope beyond what change.md actually asked for

Then run \`forgespec forge --change <id> --json\` and let the CLI's deterministic checks (duplicate ids, bad dependencies, missing requirement references, empty acceptance, cycles, coverage) be the final gate, not the first one. If it fails, fix the plan rather than reflexively re-running it.

If a sealed plan must change, use \`forgespec forge --change <id> --replan --json\` only once no task is \`RUNNING\` — replanning under a live task risks invalidating in-flight evidence.`;
}

export function getExecInstructions(): string {
  return `Execute exactly one task. ForgeSpec owns commands, evidence, and state — your job is the implementation decision inside the contract the task already defines, not re-deciding what the task is.

## Preflight, then implement only what the task asks

1. \`forgespec agent preflight <task> --json\`. If \`ready\` is false, stop and resolve the reported blockers — do not work around them.
2. \`forgespec exec start <task> --json\` then \`forgespec agent context <task> --json\`. Use only that context: the linked requirement(s), acceptance criteria, and suggested paths it returns. Read the requirement text and acceptance criteria before writing any code — know what "done" means for this task before starting.
3. Identify the minimal coherent implementation that satisfies the acceptance criteria. Preserve existing architecture and conventions in the touched area unless the task itself explicitly calls for changing them.
4. Implement that task only. Do not start a second task, and do not implement work that belongs to a different task in the plan just because it would be convenient to do now.
5. Keep changed files inside the task's declared \`touches\` globs — \`git-diff-scope\` enforces this at finish time, so a change outside them is a scope violation to fix now, not a surprise to react to later.

## Stay inside the task's scope

Do not:
- clean up unrelated modules
- implement a different, adjacent task because it's convenient right now
- expand scope because it seems like a natural improvement
- silently simplify a requirement
- defer part of a requirement while still reporting the task complete

That work belongs to its own task if it's worth doing at all. If the task is genuinely too large or ambiguous to execute as written, that's a planning defect, not something to paper over during exec.

If implementation reveals that the task is incorrectly specified — the acceptance criteria contradict the linked requirement, a dependency assumption is wrong, or the described approach can't actually work — stop and report the exact mismatch instead of improvising around it. The correct fix is to re-plan or update the change, not to quietly reinterpret the contract.

For example: "T04's acceptance criteria require rejecting a token with no \`exp\` claim, but REQ-AUTH-003 only describes expired tokens — this task can't be implemented as specified without also changing REQ-AUTH-003 or T04's acceptance criteria" is a stop-and-report; silently implementing the stricter behavior anyway and calling the task done is not.

## Hold a quality bar

- Follow existing code conventions in the area you're touching.
- Preserve separation of concerns.
- Avoid introducing an abstraction the task doesn't need.
- Avoid a giant function/class where the existing codebase would split it.
- Preserve backwards compatibility when the requirement calls for it.
- Handle the failure paths the task's acceptance criteria call for, not just the happy path.
- Write or update tests according to the configured test policy for this task.
- Keep the diff focused on this task — a reviewer should be able to tell what task produced it without reading the plan.

## Use project tools instead of reconstructing commands

Run project tools as needed, e.g. \`forgespec tool run focused-tests --task <task> --json\` when registered, rather than reconstructing shell test/build commands by hand — a hand-built command bypasses the evidence and telemetry the registered tool produces.

## Debug within scope

- Inspect the actual failure before reacting.
- Distinguish an implementation bug (fix it) from an environment or precondition failure (report it — it's a blocker, not something to code around).
- Fix only within this task's scope.
- Never weaken an assertion or skip a test to force a green result.
- Never remove validator coverage to make a failure go away.
- Never fabricate evidence that a check passed.

## Finish through the CLI, not by asserting done

\`forgespec exec finish <task> --json\` runs the task's validators and writes evidence. Your own belief that the task is complete is not completion — only a successful \`exec finish\` is. If it fails, treat the failure the same as any other validator failure above.

Stop after finishing. Suggest \`/forge:archive\` only if \`exec finish\` actually succeeded.

Never edit \`runtime/*.json\` by hand. Never treat a Markdown checkbox as task state.`;
}

export function getArchiveInstructions(): string {
  return `Verify delivery before accepting a task. The question this skill answers is: is this genuinely good enough to accept as delivered — not "did the agent say it's done."

The CLI owns evidence freshness, validator execution, state transitions, waivers, and the archive/close mechanics themselves. This skill owns the semantic judgment the CLI cannot make: whether the implementation actually satisfies the requirement, stayed in scope, and holds up architecturally.

## Gather what you need

1. \`forgespec agent context <task> --json\` and \`forgespec tool run evidence-inspection --task <task> --json\` — the linked requirement(s), acceptance criteria, and what evidence already exists.

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
Actionable: "REQ-AUTH-003 requires expired tokens to be rejected, but TokenValidator accepts tokens when \`exp\` is missing. Add explicit \`exp\` validation and a regression test."

If any archive validator is \`spec-compliance\` or \`code-review\` (or another configured semantic validator), write your findings as the review JSON this rubric produces and submit it: \`forgespec review submit <task> --validator <name> --file <review.json>\`. Critical findings must be zero before the archive gate will accept that validator.

Semantic review complements deterministic evidence — it never replaces build, test, lint, or typecheck results, and it never substitutes for evidence that's actually stale.

## Run the gate, don't bypass it

\`forgespec archive <task> --json\`. This fails closed: there is no \`--yes\` or blanket bypass. The only escape hatch is \`--waiver <validator> --reason <auditable reason>\`, used only for a deliberate, reasoned decision to skip a specific validator — never to make a real failure disappear, and never claim a validator "passed" when it was actually waived.

## Close the change when it's actually ready

If \`forgespec ready --json\` reports \`closeReady\`, merge requirements into \`forgespec/specs/\` using \`runtime/spec-sync.json\`, then \`forgespec close --change <id> --json\`. Before closing, check that:
- every mandatory requirement's stable ID is actually present in the durable specs (\`close\` enforces this, but read the merge rather than trusting it blindly)
- no requirement text was lossy-summarized away during the merge
- the specs read coherently on their own, not just as a diff against change.md

Do not move files by hand. Archive and close are quality gates, not filesystem operations.`;
}

export function getWorkflowTemplates(): SkillTemplate[] {
  return [
    {
      id: 'explore',
      name: 'forge-explore',
      description:
        'Explore the repository and problem without implementing. Use before propose when the approach is unclear.',
      instructions: getExploreInstructions(),
    },
    {
      id: 'propose',
      name: 'forge-propose',
      description:
        'Write and seal a ForgeSpec change.md contract. Use when the user wants to specify a change.',
      instructions: getProposeInstructions(),
    },
    {
      id: 'forge',
      name: 'forge-forge',
      description:
        'Compile a sealed change.md into plan.yaml via the ForgeSpec CLI. Use after propose seal.',
      instructions: getForgeInstructions(),
    },
    {
      id: 'exec',
      name: 'forge-exec',
      description:
        'Execute exactly one ForgeSpec task with CLI preflight, validators, and evidence.',
      instructions: getExecInstructions(),
    },
    {
      id: 'archive',
      name: 'forge-archive',
      description:
        'Archive a ForgeSpec task through the fail-closed evidence gate, then close the change when ready.',
      instructions: getArchiveInstructions(),
    },
  ];
}

export function generateSkillMarkdown(template: SkillTemplate, generatedBy: string): string {
  return `---
name: ${template.name}
description: ${template.description}
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "${generatedBy}"
---

${template.instructions}
`;
}
