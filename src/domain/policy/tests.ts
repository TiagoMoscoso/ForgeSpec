import type { PlanTask } from '../task-graph/types.js';
import type { TestPolicyName } from '../task-graph/types.js';
import { globMatches } from '../task-graph/globs.js';
import { Codes } from '../validation/codes.js';
import { ForgeError } from '../validation/error.js';

export interface TestPolicyInput {
  creation: TestPolicyName;
  focused_execution: TestPolicyName;
  testGlobs: string[];
  filesAtStart: string[];
  filesAtFinish: string[];
  task: PlanTask;
  mandatoryRequirementCount: number;
}

export function resolveEffectiveCreation(
  policy: TestPolicyName,
  input: TestPolicyInput,
): TestPolicyName {
  if (policy === 'when_behavior_changes') {
    return input.mandatoryRequirementCount > 0 ? 'required' : 'optional';
  }
  if (policy === 'when_missing') {
    const hasTests = input.filesAtStart.some((file) =>
      input.testGlobs.some((glob) => globMatches(glob, file)),
    );
    return hasTests ? 'optional' : 'required';
  }
  return policy;
}

export function newTestFiles(
  input: Pick<TestPolicyInput, 'filesAtStart' | 'filesAtFinish' | 'testGlobs'>,
): string[] {
  const start = new Set(input.filesAtStart);
  return input.filesAtFinish.filter(
    (file) => !start.has(file) && input.testGlobs.some((glob) => globMatches(glob, file)),
  );
}

export function assertTestCreationPolicy(input: TestPolicyInput): void {
  const effective = resolveEffectiveCreation(input.task.tests?.creation ?? input.creation, input);
  const created = newTestFiles(input);
  if (effective === 'required' && created.length === 0) {
    throw new ForgeError(
      Codes.VALIDATOR_TESTS,
      `Task ${input.task.id} requires test creation but no new test files were added.`,
      'Add focused tests covering the task acceptance criteria, then re-run exec finish.',
    );
  }
  if (effective === 'forbidden' && created.length > 0) {
    throw new ForgeError(
      Codes.VALIDATOR_TESTS,
      `Task ${input.task.id} forbids creating tests but new test files were added: ${created.join(', ')}.`,
      'Remove the new test files or change tests.creation policy.',
      { files: created },
    );
  }
}
