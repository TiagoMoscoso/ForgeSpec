# ForgeSpec

ForgeSpec is a customizable harness for AI software engineering. It turns architectural intent into a dependency-aware task graph and requires verifiable evidence before accepting delivery.

**Specs tell agents what to build. ForgeSpec proves they built it.**

The CLI binary is **`forgespec`**. There is no `forge` alias (that name collides with the Laravel Forge CLI).

## Install (GitHub Packages)

GitHub Packages npm **requires authentication even for public packages**. Create a classic personal access token with the `read:packages` scope.

```bash
npm login --scope=@tiagomoscoso --auth-type=legacy --registry=https://npm.pkg.github.com
npm install -g @tiagomoscoso/forgespec
```

Or in your user `~/.npmrc` (never commit a token):

```
@tiagomoscoso:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

The first publish of a GitHub Packages npm package is **private** until the owner changes visibility in package settings. Public visibility cannot be reversed. See [docs/github-packages.md](docs/github-packages.md).

## Initialize a project

```bash
cd your-project
forgespec init --tools cursor,claude,codex
```

This creates `forgespec/config.yaml` and generates skills/commands for the selected tools. It does not edit shell profiles.

Want an agent to drive setup? Paste [docs/install.md](docs/install.md).

## Workflow

```text
explore (optional) → propose → forge → exec <one task> → archive <task> → close
```

Agent skills (`/forge-explore`, `/forge:propose`, `$forgespec-exec`, …) orchestrate. The CLI owns every state transition, validator run, evidence record, and archive/close.

Canonical artifacts per change:

- `forgespec/changes/<id>/change.md` — human semantic contract
- `forgespec/changes/<id>/plan.yaml` — sealed executable graph

Task state is machine-owned under `runtime/`. Markdown checkboxes are not evidence.

## Development

```bash
pnpm install
pnpm test
pnpm build
node bin/forgespec.js --help
```

Requires Node.js 22+.

## License

MIT
