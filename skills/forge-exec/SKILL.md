---
name: forge-exec
description: Execute exactly one ForgeSpec task with CLI preflight, validators, and evidence.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

Execute exactly one task. ForgeSpec owns commands, evidence, and state — your job is the implementation decision inside the contract the task already defines, not re-deciding what the task is.

## Preflight, then implement only what the task asks

1. `forgespec agent preflight <task> --json`. If `ready` is false, stop and resolve the reported blockers — do not work around them.
2. `forgespec exec start <task> --json` then `forgespec agent context <task> --json`. Use only that context: the linked requirement(s), acceptance criteria, and suggested paths it returns. Read the requirement text and acceptance criteria before writing any code — know what "done" means for this task before starting.
3. Identify the minimal coherent implementation that satisfies the acceptance criteria. Preserve existing architecture and conventions in the touched area unless the task itself explicitly calls for changing them.
4. Implement that task only. Do not start a second task, and do not implement work that belongs to a different task in the plan just because it would be convenient to do now.
5. Keep changed files inside the task's declared `touches` globs — `git-diff-scope` enforces this at finish time, so a change outside them is a scope violation to fix now, not a surprise to react to later.

## Stay inside the task's scope

Do not:
- clean up unrelated modules
- implement a different, adjacent task because it's convenient right now
- expand scope because it seems like a natural improvement
- silently simplify a requirement
- defer part of a requirement while still reporting the task complete

That work belongs to its own task if it's worth doing at all. If the task is genuinely too large or ambiguous to execute as written, that's a planning defect, not something to paper over during exec.

If implementation reveals that the task is incorrectly specified — the acceptance criteria contradict the linked requirement, a dependency assumption is wrong, or the described approach can't actually work — stop and report the exact mismatch instead of improvising around it. The correct fix is to re-plan or update the change, not to quietly reinterpret the contract.

For example: "T04's acceptance criteria require rejecting a token with no `exp` claim, but REQ-AUTH-003 only describes expired tokens — this task can't be implemented as specified without also changing REQ-AUTH-003 or T04's acceptance criteria" is a stop-and-report; silently implementing the stricter behavior anyway and calling the task done is not.

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

Run project tools as needed, e.g. `forgespec tool run focused-tests --task <task> --json` when registered, rather than reconstructing shell test/build commands by hand — a hand-built command bypasses the evidence and telemetry the registered tool produces.

## Debug within scope

- Inspect the actual failure before reacting.
- Distinguish an implementation bug (fix it) from an environment or precondition failure (report it — it's a blocker, not something to code around).
- Fix only within this task's scope.
- Never weaken an assertion or skip a test to force a green result.
- Never remove validator coverage to make a failure go away.
- Never fabricate evidence that a check passed.

## Finish through the CLI, not by asserting done

`forgespec exec finish <task> --json` runs the task's validators and writes evidence. Your own belief that the task is complete is not completion — only a successful `exec finish` is. If it fails, treat the failure the same as any other validator failure above.

Stop after finishing. Suggest `/forge:archive` only if `exec finish` actually succeeded.

Never edit `runtime/*.json` by hand. Never treat a Markdown checkbox as task state.
