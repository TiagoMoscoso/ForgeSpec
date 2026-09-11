# CLI

The `forgespec` binary is the deterministic harness. Agent skills call these commands; they do not own task state.

Global flags:

- `--json` — one JSON document on stdout. Human text on stderr. Failures still use a JSON object with `ok: false` and a `code`.

## Setup

- `forgespec init [--tools cursor,claude,codex] [--force]`
- `forgespec update [--tools ...]`

## Query

- `forgespec status [--change <id>]`
- `forgespec validate [--change <id>]`
- `forgespec graph [--change <id>]`
- `forgespec waves [--change <id>]`
- `forgespec ready [--change <id>] [--close]`
- `forgespec context <task> [--change <id>]`
- `forgespec evidence <task> [--change <id>]`
- `forgespec skill [name]` — with a name, returns `{id, title, description, checklist, configured}` for that specialist
- `forgespec agent preflight <task>`
- `forgespec agent context <task>`
- `forgespec tool list`
- `forgespec tool inspect <tool>`
- `forgespec tool run <tool> [--task] [--dry-run] [--confirm] [--set name=value]`

## Lifecycle

- `forgespec propose seal --change <id>`
- `forgespec forge --change <id> [--replan]`
- `forgespec exec start <task> [--change <id>]`
- `forgespec exec finish <task> [--change <id>]`
- `forgespec exec reset <task> --reason <text>`
- `forgespec review submit <task> --validator <name> --file <path>`
- `forgespec archive <task> [--waiver <validator> --reason <text>]`
- `forgespec close --change <id>`
- `forgespec task cancel <task> --reason <text>`
- `forgespec workspace setup --change <id> [--worktree <path>]`
- `forgespec workspace check --change <id>`

`--yes` is not a quality bypass. Waivers are explicit and auditable.

## Error codes

- `FGE1xx` config / change selection
- `FGE2xx` plan / requirements
- `FGE3xx` task / preflight
- `FGE4xx` evidence
- `FGE5xx` validators
- `FGE6xx` git / workspace
- `FGE7xx` archive / close
- `FGE8xx` path / command safety
- `FGE9xx` lifecycle actions
- `FGE11xx` Agent Tools
