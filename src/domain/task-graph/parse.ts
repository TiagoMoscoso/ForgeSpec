import { z } from 'zod';
import { Codes } from '../validation/codes.js';
import { ForgeError } from '../validation/error.js';
import type { Plan, PlanTask } from './types.js';

const CommandCheckSchema = z
  .object({
    argv: z.array(z.string()).min(1),
    timeout_ms: z.number().int().positive().optional(),
  })
  .strict();

const PrerequisiteSchema = z
  .object({
    type: z.enum(['env', 'manual', 'command']),
    check: CommandCheckSchema.optional(),
    message: z.string().min(1),
  })
  .strict();

const TestPolicySchema = z.enum([
  'required',
  'optional',
  'forbidden',
  'when_missing',
  'when_behavior_changes',
]);

const PlanTaskSchema = z
  .object({
    id: z
      .string()
      .regex(/^[A-Z][A-Z0-9-]*$/, 'Task ids must be stable tokens like T01 or AUTH-001'),
    title: z.string().min(1),
    kind: z.enum(['implement', 'test', 'docs', 'spike', 'manual']).default('implement'),
    requirements: z.array(z.string()).default([]),
    depends_on: z.array(z.string()).default([]),
    acceptance: z.array(z.string()).default([]),
    validators: z.array(z.string()).default([]),
    touches: z.array(z.string()).default([]),
    locks: z.array(z.string()).default([]),
    prerequisites: z.array(PrerequisiteSchema).default([]),
    depends_on_state: z.enum(['verified', 'implemented']).optional(),
    tests: z
      .object({
        creation: TestPolicySchema.optional(),
        focused_execution: TestPolicySchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const PlanSchema = z
  .object({
    version: z.literal(1),
    change_id: z.string().min(1),
    change_hash: z.string().optional(),
    forged_at: z.string().optional(),
    tasks: z.array(PlanTaskSchema).min(1),
  })
  .strict();

export function parsePlanDocument(value: unknown): Plan {
  const result = PlanSchema.safeParse(value);
  if (!result.success) {
    throw new ForgeError(
      Codes.PLAN_INVALID,
      'plan.yaml does not match the ForgeSpec schema.',
      'Fix plan.yaml until `forgespec validate` passes.',
      {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    );
  }
  return result.data as Plan;
}

export function taskBodyHashPayload(task: PlanTask): unknown {
  return {
    id: task.id,
    title: task.title,
    kind: task.kind,
    requirements: task.requirements,
    depends_on: task.depends_on,
    acceptance: task.acceptance,
    validators: task.validators,
    touches: task.touches,
    locks: task.locks,
    prerequisites: task.prerequisites,
    depends_on_state: task.depends_on_state,
    tests: task.tests,
  };
}
