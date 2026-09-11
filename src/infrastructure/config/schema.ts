import { z } from 'zod';
import { Codes } from '../../domain/validation/codes.js';
import { ForgeError } from '../../domain/validation/error.js';

export const SpecialistName = z.enum([
  'architecture',
  'flow',
  'testing',
  'security',
  'data',
  'api',
  'migration',
  'observability',
  'concurrency',
  'performance',
  'frontend',
]);

export const TestPolicySchema = z.enum([
  'required',
  'optional',
  'forbidden',
  'when_missing',
  'when_behavior_changes',
]);

export const IsolationSchema = z.enum(['none', 'branch-per-change', 'worktree-per-change']);

export const ActionSchema = z
  .object({
    type: z.enum(['none', 'commit', 'push', 'pull_request', 'command']),
    argv: z.array(z.string()).min(1).optional(),
    timeout_ms: z.number().int().positive().optional(),
  })
  .strict();

export const ValidatorCommandSchema = z
  .object({
    argv: z.array(z.string()).min(1),
    timeout_ms: z.number().int().positive().optional(),
  })
  .strict();

export const ConfigSchema = z
  .object({
    version: z.literal(1),
    project: z
      .object({
        context: z.array(z.string()).default([]),
        test_globs: z
          .array(z.string())
          .default(['**/*.{test,spec}.{ts,js,tsx,jsx}', '**/test/**', '**/tests/**']),
        validator_commands: z.record(z.string(), ValidatorCommandSchema).default({}),
      })
      .strict()
      .default({
        context: [],
        test_globs: ['**/*.{test,spec}.{ts,js,tsx,jsx}', '**/test/**', '**/tests/**'],
        validator_commands: {},
      }),
    workflow: z
      .object({
        explore: z
          .object({
            enabled: z.boolean().default(true),
            guidance: z.array(z.string()).default([]),
          })
          .strict()
          .default({ enabled: true, guidance: [] }),
        propose: z
          .object({
            skills: z.array(SpecialistName).default(['architecture', 'flow', 'testing']),
            policy: z
              .object({
                unresolved_material_questions: z.literal(0).default(0),
              })
              .strict()
              .default({ unresolved_material_questions: 0 }),
          })
          .strict()
          .default({
            skills: ['architecture', 'flow', 'testing'],
            policy: { unresolved_material_questions: 0 },
          }),
        forge: z
          .object({
            policy: z
              .object({
                require_acceptance_criteria: z.boolean().default(true),
                require_requirement_coverage: z.boolean().default(true),
                detect_parallelism: z.boolean().default(true),
                detect_conflicts: z.boolean().default(true),
              })
              .strict()
              .default({
                require_acceptance_criteria: true,
                require_requirement_coverage: true,
                detect_parallelism: true,
                detect_conflicts: true,
              }),
          })
          .strict()
          .default({
            policy: {
              require_acceptance_criteria: true,
              require_requirement_coverage: true,
              detect_parallelism: true,
              detect_conflicts: true,
            },
          }),
        exec: z
          .object({
            one_task_per_run: z.literal(true).default(true),
            tests: z
              .object({
                creation: TestPolicySchema.default('required'),
                focused_execution: TestPolicySchema.default('required'),
              })
              .strict()
              .default({ creation: 'required', focused_execution: 'required' }),
            validators: z.array(z.string()).default(['build', 'focused-tests']),
            lock_ttl_ms: z
              .number()
              .int()
              .positive()
              .default(2 * 60 * 60 * 1000),
          })
          .strict()
          .default({
            one_task_per_run: true,
            tests: { creation: 'required', focused_execution: 'required' },
            validators: ['build', 'focused-tests'],
            lock_ttl_ms: 2 * 60 * 60 * 1000,
          }),
        archive: z
          .object({
            validators: z
              .array(z.string())
              .default(['affected-tests', 'spec-compliance', 'code-review']),
            tests: z
              .object({
                affected_execution: TestPolicySchema.default('required'),
                full_suite: TestPolicySchema.default('optional'),
              })
              .strict()
              .default({ affected_execution: 'required', full_suite: 'optional' }),
            action: ActionSchema.default({ type: 'none' }),
          })
          .strict()
          .default({
            validators: ['affected-tests', 'spec-compliance', 'code-review'],
            tests: { affected_execution: 'required', full_suite: 'optional' },
            action: { type: 'none' },
          }),
      })
      .strict()
      .default({
        explore: { enabled: true, guidance: [] },
        propose: {
          skills: ['architecture', 'flow', 'testing'],
          policy: { unresolved_material_questions: 0 },
        },
        forge: {
          policy: {
            require_acceptance_criteria: true,
            require_requirement_coverage: true,
            detect_parallelism: true,
            detect_conflicts: true,
          },
        },
        exec: {
          one_task_per_run: true,
          tests: { creation: 'required', focused_execution: 'required' },
          validators: ['build', 'focused-tests'],
          lock_ttl_ms: 2 * 60 * 60 * 1000,
        },
        archive: {
          validators: ['affected-tests', 'spec-compliance', 'code-review'],
          tests: { affected_execution: 'required', full_suite: 'optional' },
          action: { type: 'none' },
        },
      }),
    git: z
      .object({
        isolation: IsolationSchema.default('none'),
        branch_pattern: z.string().default('forgespec/<change-id>'),
      })
      .strict()
      .default({ isolation: 'none', branch_pattern: 'forgespec/<change-id>' }),
  })
  .strict();

export type ForgeConfig = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: ForgeConfig = ConfigSchema.parse({ version: 1 });

export const CHANGE_OVERLAY_ALLOWLIST = new Set([
  'workflow.explore.guidance',
  'workflow.propose.skills',
  'workflow.exec.tests',
  'workflow.exec.validators',
  'workflow.archive.validators',
  'workflow.archive.tests',
  'workflow.archive.action',
  'workflow.forge.policy',
  'project.validator_commands',
  'project.test_globs',
]);

export function assertNoShellArgv(argv: unknown, where: string): void {
  if (typeof argv === 'string') {
    throw new ForgeError(
      Codes.COMMAND_SHELL,
      `Command at ${where} must be an argv array, not a shell string.`,
      'Use argv: ["pnpm", "test"] instead of a shell string.',
    );
  }
}

export function parseConfigDocument(value: unknown, source: string): ForgeConfig {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const exec = (record.workflow as Record<string, unknown> | undefined)?.exec as
      Record<string, unknown> | undefined;
    if (exec && exec.one_task_per_run === false) {
      throw new ForgeError(
        Codes.CONFIG_INVARIANT,
        'workflow.exec.one_task_per_run cannot be false.',
        'One invocation executes one task. This invariant is not configurable.',
        { source },
      );
    }
  }
  const result = ConfigSchema.safeParse(value);
  if (!result.success) {
    throw new ForgeError(
      Codes.CONFIG_INVALID,
      `Invalid config in ${source}.`,
      'Fix config.yaml against the ForgeSpec schema. Unknown keys are rejected.',
      {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    );
  }
  return result.data;
}

function flatten(value: unknown, prefix = ''): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? { [prefix]: value } : {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      Object.assign(out, flatten(child, path));
    } else {
      out[path] = child;
    }
  }
  return out;
}

export function assertOverlayAllowlist(overlay: unknown, source: string): void {
  const flat = flatten(overlay);
  for (const key of Object.keys(flat)) {
    if (key === 'version') {
      continue;
    }
    const allowed = [...CHANGE_OVERLAY_ALLOWLIST].some(
      (allowedKey) => key === allowedKey || key.startsWith(`${allowedKey}.`),
    );
    if (!allowed) {
      throw new ForgeError(
        Codes.CONFIG_OVERLAY,
        `Change overlay ${source} sets disallowed key ${key}.`,
        `Per-change config may only override: ${[...CHANGE_OVERLAY_ALLOWLIST].join(', ')}.`,
      );
    }
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge<T>(base: T, overlay: unknown): T {
  if (!isObject(base) || !isObject(overlay)) {
    return (overlay as T) ?? base;
  }
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) {
      continue;
    }
    const existing = result[key];
    if (isObject(existing) && isObject(value)) {
      result[key] = deepMerge(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

export function defaultConfigYaml(): string {
  return `version: 1
project:
  context: []
workflow:
  explore:
    enabled: true
    guidance: []
  propose:
    skills:
      - architecture
      - flow
      - testing
    policy:
      unresolved_material_questions: 0
  forge:
    policy:
      require_acceptance_criteria: true
      require_requirement_coverage: true
      detect_parallelism: true
      detect_conflicts: true
  exec:
    one_task_per_run: true
    tests:
      creation: required
      focused_execution: required
    validators:
      - build
      - focused-tests
  archive:
    validators:
      - affected-tests
      - spec-compliance
      - code-review
    action:
      type: none
git:
  isolation: none
  branch_pattern: forgespec/<change-id>
`;
}
