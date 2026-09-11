---
name: forge-forge
description: Compile a sealed change.md into plan.yaml via the ForgeSpec CLI. Use after propose seal.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

Compile change.md into an executable task graph. This is not "split the work into pieces" — it's designing an execution structure that a set of agents (possibly running in parallel) can execute correctly.

The only artifact is `forgespec/changes/<id>/plan.yaml`. Do not persist an execution-order or progress Markdown file; `forgespec waves --json` is the derived view of execution order, always up to date, never hand-maintained.

## Ground tasks in the real repository

1. Read `forgespec/changes/<id>/change.md` and the actual repository state before drafting tasks — a task list produced from the contract alone, without checking what already exists, tends to invent unnecessary work or miss what's already partially done.
2. Reject placeholder tasks ("inspect the code", "understand the requirements") — every task must be a concrete unit of engineering work. `forgespec forge` already rejects these at compile time; don't rely on that as your quality bar, catch them yourself first.

## Design each task as one coherent responsibility

A good task has one coherent engineering responsibility, is sized for a single focused exec session, has requirement coverage, has objective acceptance conditions, and has a clear validation path. It does not mix unrelated architectural layers without necessity, is not split merely by file, is not artificially tiny, and is not so large that a failure is hard to diagnose.

Poor: "Implement backend changes" (too broad to diagnose on failure, mixes unrelated responsibilities).
Poor: "Edit file A" / "Edit file B" / "Edit file C" (split by file, not by responsibility — a reader can't tell what any one task is actually for).
Better: "Reject expired and unsigned tokens in AuthMiddleware" (one responsibility, one requirement, one clear pass/fail).

## Cover every mandatory requirement, justify every task

Every mandatory requirement in change.md must map to `requirements: [...]` on at least one task — `forgespec forge` enforces this (uncovered requirements and orphan tasks both fail compilation), so treat that as a real constraint to satisfy while drafting, not a check to fix after the fact. A task with no requirement should be an explicit, clearly-labeled enabling/infrastructure task (e.g. scaffolding a new module the requirement-bearing tasks depend on), not silently included as if it were required — and there should be no task that exists for no traceable reason at all.

## Depend on what's actually required, not what's convenient to serialize

Use `depends_on` only for a true dependency: task B cannot be correctly implemented or verified before task A exists. A "feels more natural in this order" preference is not a dependency — encoding it as one over-serializes the graph and kills parallelism for no correctness benefit.

Maximize safe parallelism. Tasks are good candidates to run in the same wave when they touch:
- separate subsystems
- independent files
- independent APIs
- independent tests
- no shared mutable infrastructure

Set `depends_on_state` deliberately: depending on a task reaching `implemented` is weaker (and faster to unblock) than requiring `verified`; use `implemented` only when that weaker guarantee is genuinely sufficient for the dependent task to proceed correctly.

## Declare real conflicts so parallel execution stays safe

Two tasks that would otherwise run in parallel but actually conflict must say so through `touches` and `locks` — overlapping `touches` globs or a shared `locks` entry are what the CLI uses to detect a conflict. Consider each of these as a real conflict source:
- overlapping files
- shared configuration
- a database schema
- generated code
- a shared external environment
- the same named lock/resource
- the same integration surface

Do not claim two tasks are independent when their `touches` would obviously collide, and do not add a lock "just in case" for tasks that don't actually share a resource — that serializes work that could have run in parallel.

## Represent external and manual prerequisites explicitly

A task that needs any of the following before it can start should declare it through `prerequisites` (`env`/`manual`/`command`), not bury it in the task description where `forgespec agent preflight` can't check it and a future exec will discover it the hard way:
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
- `build`/`typecheck`, for a task that's mostly structural
- an integration test, when the acceptance criteria span more than one component
- `code-review` or `spec-compliance` (semantic validators), when the task needs judgment a deterministic check can't apply
- manual/external verification, when the task genuinely requires it — say so explicitly rather than inventing an automated check that can't exist

`architecture-review`, `security-review`, `spec-compliance`, and `code-review` are semantic validators: they gate archive through a submitted review, not through `exec finish`, so only assign them where the task's own review actually needs that scrutiny. A spike or pure manual-verification task may credibly need no automated validator at all.

## Review the whole graph before compiling

Before running `forgespec forge --change <id> --json`, check the drafted graph for:
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

Then run `forgespec forge --change <id> --json` and let the CLI's deterministic checks (duplicate ids, bad dependencies, missing requirement references, empty acceptance, cycles, coverage) be the final gate, not the first one. If it fails, fix the plan rather than reflexively re-running it.

If a sealed plan must change, use `forgespec forge --change <id> --replan --json` only once no task is `RUNNING` — replanning under a live task risks invalidating in-flight evidence.
