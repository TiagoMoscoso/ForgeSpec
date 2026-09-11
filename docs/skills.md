# Skills

ForgeSpec spends tokens on reasoning, not on mechanics. Deterministic state — task transitions, the DAG, validators, evidence, archive/close — lives entirely in the `forgespec` CLI (see [docs/cli.md](cli.md) and [docs/agent-tools.md](agent-tools.md)). Skills exist to carry the judgment the CLI cannot make: architecture tradeoffs, requirement quality, decomposition structure, and delivery review.

## Workflow skills

Five canonical skills drive the lifecycle, one per phase: `forge-explore`, `forge-propose`, `forge-forge`, `forge-exec`, `forge-archive`. Each has a distinct, non-overlapping role and never absorbs another's responsibility — explore never implements, propose never decomposes into tasks, forge never writes production code, exec touches exactly one task, archive never bypasses the evidence gate.

Their prose still tells the agent which CLI command to run at each mechanical step (`forgespec agent preflight`, `forgespec tool run`, `forgespec propose seal`, `forgespec forge`, `forgespec exec start/finish`, `forgespec archive`, `forgespec review submit`, …) — but the bulk of each skill is judgment: how to distinguish a material question from a minor detail, how to decompose work into a safe-to-parallelize task graph, what a semantic review rubric actually checks. See `src/skills/workflows/templates.ts` for the canonical source.

## Specialist skills

Eleven focused reasoning modules (`src/skills/specialists/index.ts`) — architecture, flow, testing, security, data, api, migration, observability, concurrency, performance, frontend — are invoked selectively by `forge-explore`/`forge-propose`, never universally. `workflow.propose.skills` in config sets a default set to run; `forge-propose`'s own guidance is to reason about which _additional_ specialists a given change actually calls for, and to skip any specialist that has nothing to say about it.

A specialist is a checklist, not a workflow stage: `forgespec skill <name> --json` returns its `id`, `title`, `description`, and `checklist`. It never writes its own file — findings get merged into `change.md` by whichever workflow skill invoked it.

## Generation and drift

The TypeScript source under `src/skills/**` is the only source of truth. Two things are generated from it:

1. **Tool integrations** (`src/integrations/agents/generate.ts`) — Cursor, Claude Code, and Codex files written into a _consuming_ project by `forgespec init`/`forgespec update`. Cursor gets both a `SKILL.md` and a command file; Claude Code gets a `SKILL.md`; Codex gets a prompt file. All three render the same canonical `instructions`/`checklist` text — only the wrapper format differs per tool.
2. **Repository-visible copies** (`src/skills/generate-repo-files.ts`) — the same canonical content, checked into this repository under `skills/forge-*/SKILL.md` and `skills/specialists/*/SKILL.md`, purely for discoverability and review. These are not a second source of truth.

Regenerate both after touching a template:

```bash
pnpm run generate:skills
```

`test/unit/skill-repo-parity.test.ts` fails if `skills/**` drifts from what the canonical templates would generate, and `test/unit/skill-parity.test.ts` fails if the Cursor/Claude/Codex adapters drift from each other. Both run under the ordinary `pnpm test` CI step — there is no separate drift-checking CI job.

`test/unit/skill-inventory.test.ts` and `test/unit/skill-boundaries.test.ts` guard the shape of the content itself: the exact five workflow skills exist, the required specialist set exists, no skill ever references a `forgespec` command that doesn't exist in `src/cli/program.ts`, and no skill ever instructs creating a forbidden artifact (`proposal.md`, `design.md`, `tasks.md`, `execution-order.md`, `progress.md`) without a "do not" alongside it.
