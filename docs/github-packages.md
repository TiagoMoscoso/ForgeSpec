# GitHub Packages

ForgeSpec publishes to GitHub Packages, not npmjs.org.

Package: `@tiagomoscoso/forgespec`  
Registry: `https://npm.pkg.github.com`  
Binary: `forgespec` only

These requirements come from GitHub's current npm registry documentation.

## Authentication is required to install

GitHub Packages npm requires a token to publish, install, and delete packages, **including public packages**. This is unlike the Container registry, which allows anonymous pulls of public images.

Use a **personal access token (classic)** with:

- `read:packages` to install
- `write:packages` to publish (CI uses `GITHUB_TOKEN` instead)

Fine-grained PATs are not supported for GitHub Packages npm.

### npm 9+

```bash
npm login --scope=@tiagomoscoso --auth-type=legacy --registry=https://npm.pkg.github.com
```

Username: your GitHub username  
Password: the classic PAT  
Email: your public GitHub email

Then:

```bash
npm install -g @tiagomoscoso/forgespec
```

### User ~/.npmrc

```
@tiagomoscoso:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Never commit `_authToken` to this repository. The repo `.npmrc` only maps the scope to the registry.

## First publish is private

When a package is first published, GitHub Packages default visibility is **private**. An admin must change it to Public in package settings (Danger Zone → Change visibility). Making a package public cannot be undone.

Link the package to this repository via `package.json` `repository` so Actions in this repo can use `GITHUB_TOKEN` for later publishes.

## Publishing from GitHub Actions

Release workflow permissions:

```yaml
permissions:
  contents: write
  packages: write
```

`actions/setup-node` must set `registry-url: https://npm.pkg.github.com` and `scope: '@tiagomoscoso'`. Publish with `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.

npmjs trusted publishing (OIDC `id-token`) is **not** used. GitHub Packages authenticates Actions with `GITHUB_TOKEN`.

Duplicate versions fail closed: the release job aborts if `@tiagomoscoso/forgespec@version` already exists.

## Release workflow

Publishing is handled by `.github/workflows/release.yml`. Regular pushes and pull requests run CI only.

### Tag-based release (automatic publish)

Bump `package.json`, commit to `main`, then push a matching tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The tag must match `package.json` exactly (`0.1.0` → `v0.1.0`). Tag pushes always run in **PUBLISH** mode.

### Manual release

In **Actions → Release → Run workflow**:

| `publish`         | Behavior                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `false` (default) | **DRY RUN** — runs all quality gates and packaging; does **not** publish or create a GitHub Release |
| `true`            | **PUBLISH** — publishes to GitHub Packages and creates a GitHub Release                             |

Each run writes a **Release plan summary** to the job summary (`$GITHUB_STEP_SUMMARY`) showing mode, package, version, tag, and whether publish/release steps will run.

## Versioning

SemVer in `package.json`. Push tag `vX.Y.Z` (must match `package.json`) to run `.github/workflows/release.yml`.
