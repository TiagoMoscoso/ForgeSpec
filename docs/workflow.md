# Workflow

```text
explore (optional)
    → propose
    → forge
    → exec <one task>
    → archive <task>
    → close
```

## Canonical files

For a change named `add-token-validator`:

```text
forgespec/
  config.yaml
  specs/
  changes/add-token-validator/
    change.md
    plan.yaml
    runtime/
  archive/
```

Do not add `proposal.md`, `design.md`, `tasks.md`, or a progress board. `forgespec waves` and `forgespec status` are derived views.

## States

`BLOCKED → READY → RUNNING → IMPLEMENTED → VERIFIED → ARCHIVED`

`IMPLEMENTED ≠ VERIFIED ≠ ARCHIVED`. Completion is evidence plus validators, not a checkbox.

## Parallel agents

`plan.yaml` is immutable after forge except `--replan`. Each task has its own `runtime/tasks/<id>/` files so agents do not merge a shared progress document. One RUNNING task per worktree.

## Git isolation

`git.isolation` may be `none` (default), `branch-per-change`, or `worktree-per-change`. When enabled, `exec` and `archive` fail if the current branch/worktree is not the one recorded by `forgespec workspace setup`.
