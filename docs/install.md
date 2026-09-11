# Install ForgeSpec with an AI assistant

Copy this prompt into your coding assistant. It must follow every constraint.

---

Install ForgeSpec in this project.

Constraints you MUST follow:

1. Confirm the working directory with me before you create `forgespec/`. Init writes files wherever it runs.
2. If you need to install the CLI globally, show the exact command and wait for my confirmation. Prefer:
   - `npm install -g @tiagomoscoso/forgespec`
     after authenticating to GitHub Packages (see docs/github-packages.md). Do not pick a package manager based on this repo's lockfile.
3. Stop if the install needs sudo, fails with a permissions error, or the global bin directory is missing. Never edit my shell startup files (`.bashrc`, `.zshrc`, `.profile`, fish config, PowerShell profile).
4. Ask which AI tools I use and map them to `cursor`, `claude`, and/or `codex`. Then run:
   `forgespec init --tools <ids>`
5. Do not overwrite an existing `forgespec/config.yaml` unless I explicitly ask. `init` without `--force` leaves it in place.
6. After init, run `forgespec validate --json` and show me what was created.
7. Never run `preinstall` / `install` / `postinstall` scripts of your own invention. Do not curl-pipe scripts into a shell.

If any step is blocked, stop and tell me why.
