import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stringify as stringifyYaml } from 'yaml';

export const SAMPLE_CHANGE = `---
id: add-token-validator
title: Add token validator
---

# Intent
Reject expired access tokens at the API boundary.

# Scope
Add a validator used by the auth middleware.

# Non-goals
Identity provider changes.

# Requirements

### REQ-AUTH-001: Reject expired tokens
The system MUST reject expired access tokens with HTTP 401.
Acceptance:
- Expired signature-valid tokens return 401
Kind: mandatory
Capability: auth

# Architecture
Keep validation in src/auth.

# Decisions
### DEC-001: Dedicated validator module
Use a focused module rather than inline checks.

# Open questions
None.
`;

export const SAMPLE_PLAN = {
  version: 1 as const,
  change_id: 'add-token-validator',
  tasks: [
    {
      id: 'T01',
      title: 'Implement token validator',
      kind: 'implement' as const,
      requirements: ['REQ-AUTH-001'],
      depends_on: [],
      acceptance: ['rejects expired tokens'],
      validators: ['dependency-state'],
      touches: ['src/auth/**'],
      locks: ['auth-service'],
      prerequisites: [],
    },
  ],
};

export const TEST_CONFIG = `version: 1
project:
  context: []
  test_globs:
    - "**/*.test.ts"
  validator_commands:
    build:
      argv: ["node", "-e", "process.exit(0)"]
    focused-tests:
      argv: ["node", "-e", "process.exit(0)"]
workflow:
  exec:
    tests:
      creation: optional
      focused_execution: optional
    validators:
      - dependency-state
  archive:
    validators:
      - dependency-state
    action:
      type: none
git:
  isolation: none
`;

export async function tempDir(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), 'forgespec-'));
}

export async function writeChangeFixture(root: string): Promise<string> {
  const dir = path.join(root, 'forgespec', 'changes', 'add-token-validator');
  await mkdir(dir, { recursive: true });
  await mkdir(path.join(root, 'forgespec', 'specs'), { recursive: true });
  await mkdir(path.join(root, 'forgespec', 'archive'), { recursive: true });
  await writeFile(path.join(root, 'forgespec', 'config.yaml'), TEST_CONFIG, 'utf8');
  await writeFile(path.join(dir, 'change.md'), SAMPLE_CHANGE, 'utf8');
  await writeFile(path.join(dir, 'plan.yaml'), stringifyYaml(SAMPLE_PLAN), 'utf8');
  await mkdir(path.join(root, 'src', 'auth'), { recursive: true });
  await writeFile(
    path.join(root, 'src', 'auth', 'validator.ts'),
    'export const ok = true;\n',
    'utf8',
  );
  return dir;
}
