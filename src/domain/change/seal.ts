import { Codes } from '../validation/codes.js';
import { ForgeError } from '../validation/error.js';
import type { ChangeContract } from './types.js';

export function assertSealable(change: ChangeContract): void {
  if (change.intent.trim() === '') {
    throw new ForgeError(Codes.CHANGE_PARSE, 'Intent/Why must not be empty to seal a proposal.');
  }
  if (change.scope.trim() === '') {
    throw new ForgeError(Codes.CHANGE_PARSE, 'Scope must not be empty to seal a proposal.');
  }
  if (change.openQuestions.length > 0) {
    throw new ForgeError(
      Codes.CHANGE_OPEN_QUESTIONS,
      'Proposal has unresolved material open questions.',
      'Resolve every open question with the user, or record an explicit decision. Do not invent assumptions.',
      { questions: change.openQuestions },
    );
  }
  for (const requirement of change.requirements) {
    if (requirement.acceptance.length === 0) {
      throw new ForgeError(
        Codes.CHANGE_PARSE,
        `Requirement ${requirement.id} has no acceptance criteria.`,
        'Add an Acceptance list under the requirement.',
      );
    }
    if (!requirement.text.trim()) {
      throw new ForgeError(
        Codes.CHANGE_PARSE,
        `Requirement ${requirement.id} has no description.`,
        'Describe observable behavior, not implementation trivia.',
      );
    }
  }
}
