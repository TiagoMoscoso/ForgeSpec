import { z } from 'zod';
import { Codes } from '../../domain/validation/codes.js';
import { ForgeError } from '../../domain/validation/error.js';
import { TOOL_ID_PATTERN } from '../../domain/tools/types.js';

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

export const ToolPhaseSchema = z.enum(['explore', 'propose', 'forge', 'exec', 'archive']);
export const ToolRiskSchema = z.enum(['read', 'write', 'destructive']);
export const ToolParamTypeSchema = z.enum([
  'string',
  'integer',
  'boolean',
  'enum',
  'path',
  'task-id',
]);
export const ToolParamSourceSchema = z.enum([
  'cli',
  'task.id',
  'task.title',
  'task.kind',
  'task.touches',
  'change.id',
]);

export const ToolParameterSchema = z
  .object({
    type: ToolParamTypeSchema,
    required: z.boolean().default(false),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    enum: z.array(z.string()).min(1).optional(),
    source: ToolParamSourceSchema.default('cli'),
  })
  .strict();

export const ToolDefinitionSchema = z
  .object({
    executable: z.string().min(1),
    args: z.array(z.string()).default([]),
    cwd: z.string().optional(),
    phases: z.array(ToolPhaseSchema).min(1).default(['exec']),
    timeout: z
      .string()
      .regex(/^\d+s$/, 'timeout must look like 120s')
      .optional(),
    timeout_ms: z.number().int().positive().optional(),
    risk: ToolRiskSchema.default('read'),
    confirm: z.boolean().optional(),
    resources: z.array(z.string()).default([]),
    parameters: z.record(z.string(), ToolParameterSchema).default({}),
    env: z.array(z.string()).default([]),
    evidence: z
      .object({
        type: z.enum(['test', 'command', 'none']).default('command'),
      })
      .strict()
      .optional(),
    description: z.string().optional(),
  })
  .strict();

export const WorkflowHookSchema = z
  .object({
    tool: z.string().min(1),
  })
  .strict();

export const ObservabilitySchema = z
  .object({
    enabled: z.boolean().default(false),
    service: z
      .object({
        name: z.string().min(1).default('forgespec'),
      })
      .strict()
      .default({ name: 'forgespec' }),
    otlp: z
      .object({
        endpoint: z.string().default(''),
      })
      .strict()
      .default({ endpoint: '' }),
    metrics: z
      .object({
        enabled: z.boolean().default(true),
      })
      .strict()
      .default({ enabled: true }),
    tracing: z
      .object({
        enabled: z.boolean().default(true),
      })
      .strict()
      .default({ enabled: true }),
    logs: z
      .object({
        enabled: z.boolean().default(true),
      })
      .strict()
      .default({ enabled: true }),
    privacy: z
      .object({
        include_paths: z.boolean().default(false),
        include_command_args: z.boolean().default(false),
      })
      .strict()
      .default({ include_paths: false, include_command_args: false }),
  })
  .strict()
  .default({
    enabled: false,
    service: { name: 'forgespec' },
    otlp: { endpoint: '' },
    metrics: { enabled: true },
    tracing: { enabled: true },
    logs: { enabled: true },
    privacy: { include_paths: false, include_command_args: false },
  });

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
            before: z.array(WorkflowHookSchema).default([]),
            after: z.array(WorkflowHookSchema).default([]),
          })
          .strict()
          .default({
            one_task_per_run: true,
            tests: { creation: 'required', focused_execution: 'required' },
            validators: ['build', 'focused-tests'],
            lock_ttl_ms: 2 * 60 * 60 * 1000,
            before: [],
            after: [],
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
            before: z.array(WorkflowHookSchema).default([]),
            after: z.array(WorkflowHookSchema).default([]),
          })
          .strict()
          .default({
            validators: ['affected-tests', 'spec-compliance', 'code-review'],
            tests: { affected_execution: 'required', full_suite: 'optional' },
            action: { type: 'none' },
            before: [],
            after: [],
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
          before: [],
          after: [],
        },
        archive: {
          validators: ['affected-tests', 'spec-compliance', 'code-review'],
          tests: { affected_execution: 'required', full_suite: 'optional' },
          action: { type: 'none' },
          before: [],
          after: [],
        },
      }),
    git: z
      .object({
        isolation: IsolationSchema.default('none'),
        branch_pattern: z.string().default('forgespec/<change-id>'),
      })
      .strict()
      .default({ isolation: 'none', branch_pattern: 'forgespec/<change-id>' }),
    tools: z.record(z.string(), ToolDefinitionSchema).default({}),
    observability: ObservabilitySchema,
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
  'workflow.archive.before',
  'workflow.archive.after',
  'workflow.exec.before',
  'workflow.exec.after',
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
  for (const [id, tool] of Object.entries(result.data.tools)) {
    if (!TOOL_ID_PATTERN.test(id)) {
      throw new ForgeError(
        Codes.CONFIG_INVALID,
        `Invalid tool id '${id}' in ${source}.`,
        'Tool ids must be lowercase kebab-case (a-z, digits, hyphen).',
      );
    }
    assertNoShellArgv(tool.args, `tools.${id}.args`);
    if (/\s/.test(tool.executable) || /[;&|`$<>]/.test(tool.executable)) {
      throw new ForgeError(
        Codes.COMMAND_SHELL,
        `Tool '${id}' executable must be a single argv[0], not a shell string.`,
        'Use executable plus args: []. Never pass shell metacharacters in executable.',
      );
    }
    for (const [paramName, spec] of Object.entries(tool.parameters)) {
      if (spec.type === 'enum' && (!spec.enum || spec.enum.length === 0)) {
        throw new ForgeError(
          Codes.CONFIG_INVALID,
          `Tool '${id}' parameter '${paramName}' has type enum but no values.`,
        );
      }
    }
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
