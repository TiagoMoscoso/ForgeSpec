---
name: forge-explore
description: Explore the repository and problem without implementing. Use before propose when the approach is unclear.
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "0.1.0"
---

Optional thinking mode. Compare approaches and surface risks. Do not implement or write runtime files.

Use this mode when the right approach is unclear, when the user's first idea might not be the best one, or when you need to understand a subsystem before proposing a change to it. Skip it when the change is already well understood — go straight to `/forge:propose`.

## Ground yourself in the real repository first

1. `forgespec tool run repository-inspection --json` (and `forgespec tool run git-diff --json` if recent history is relevant).
2. Read the actual source, tests, and `forgespec/specs/` for the area under discussion before forming an opinion. An opinion formed before reading the code is a guess, not exploration.
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

```
Option A
+ lower complexity, matches existing service-layer pattern
+ no new operational dependency
- does not support cross-process sharing if that turns out to matter

Option B
+ supports distributed state
- introduces an operational dependency (cache/queue) not otherwise in this codebase
- inconsistent with how every other module here manages state
```

Or a flow sketch when the current vs. proposed shape is the actual point of confusion:

```
CURRENT
Input -> Parser -> Domain Service -> Persistence

PROPOSED
Input -> Parser -> Domain Service -> Cache -> Persistence
```

Don't force a diagram or table where a sentence would do; use them only when they make a real comparison easier to see.

## Ask only what the repository can't answer

Before asking the user anything, check whether the repository already answers it. Only ask questions that would materially change scope, behavior, architecture, compatibility, or acceptance criteria. Do not turn exploration into an interview — a long list of clarifying questions about things you could have checked yourself is a sign you didn't look hard enough. Stop asking once you have enough clarity to specify the change; more questions past that point just delay propose.

## Boundaries

- Never write or edit production code, tests, or runtime files in this mode.
- Never create `forgespec/changes/<id>/change.md` or any other change artifact here — that belongs to `/forge:propose`.
- Never mark anything as decided, done, or in progress; exploration produces understanding and a recommendation, not state.
- When the picture is clear enough to specify the change, stop and recommend `/forge:propose`, carrying forward your findings (facts, inferences, and any genuinely open questions) rather than re-deriving them there.
