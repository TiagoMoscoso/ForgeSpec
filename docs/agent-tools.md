# Agent Tools

ForgeSpec exposes deterministic capabilities so agents spend tokens on design, not on reconstructing shell procedures.

**Agents reason. ForgeSpec executes, validates, and records.**

## Tools vs validators vs actions

| Kind          | Role                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------- |
| **Tool**      | Named executable capability (`forgespec tool run`)                                       |
| **Validator** | Pass/fail quality assertion. May _invoke_ a tool; a tool run is not automatically a gate |
| **Action**    | Lifecycle side effect after archive (commit, command, none)                              |
| **Guidance**  | Advisory text for skills                                                                 |

Scripts under `scripts/` are **never** auto-exposed. Register each one under `tools:` in `forgespec/config.yaml`.

## Built-in vs project tools

Built-in (always present): `task-preflight`, `task-context`, `dependency-inspection`, `repository-inspection`, `git-diff`, `evidence-inspection`, `workspace-validation`.

Project tools are the customization seam:

```yaml
tools:
  focused-tests:
    executable: node
    args: [scripts/run-focused-tests.mjs, '${testPattern}']
    phases: [exec, archive]
    timeout: 120s
    risk: read
    evidence:
      type: test
    parameters:
      testPattern:
        type: string
        source: task.touches
```

`executable` is argv[0]. `args` is an argv array. ForgeSpec never uses `shell: true`. Placeholders are typed (`string`, `integer`, `boolean`, `enum`, `path`, `task-id`) plus `task.id`, `task.title`, `task.kind`, `task.testPattern`, `change.id`. There is no expression language.

## Risk and phases

- **read** — inspect / status
- **write** — generate files, start local services
- **destructive** — delete, reset, destroy. Requires `--confirm`. `--dry-run` never executes.

`phases` is a subset of `explore | propose | forge | exec | archive`. A tool registered only for `archive` cannot run during `exec`.

## CLI

```text
forgespec tool list
forgespec tool inspect <tool>
forgespec tool run <tool> [--task] [--phase] [--set name=value] [--json] [--dry-run] [--confirm]

forgespec agent preflight <task>
forgespec agent context <task>
```

`--dry-run` prints the resolved plan (redacted args, cwd, phase, risk, timeout, evidence) without running it.

## Workflow hooks

```yaml
workflow:
  exec:
    before:
      - tool: ensure-lab-running
    after:
      - tool: collect-test-artifacts
  archive:
    before:
      - tool: security-scan
```

Hooks cannot skip the state machine, evidence, dependencies, or validators. A failing hook fails the operation and does not advance task state.

## Evidence

`forgespec tool run … --task` records `source.type: tool` on the task. Freshness still uses content fingerprint + plan hash. Tool failure never marks a task IMPLEMENTED.

## Skill size

Exec/archive/explore skills now call `agent preflight/context` and `tool run` instead of embedding git/test/evidence procedures. Exec instructions dropped from ~12 operational steps of reconstructed commands to five CLI-owned steps (preflight → start/context → implement → tool run → finish).

OpenTelemetry is an **optional add-on**, not part of the delivery kernel. See [docs/observability.md](observability.md).
