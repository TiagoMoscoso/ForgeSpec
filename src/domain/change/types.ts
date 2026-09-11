export type RequirementKind = 'mandatory' | 'optional';

export interface Requirement {
  id: string;
  title: string;
  text: string;
  acceptance: string[];
  kind: RequirementKind;
  capability?: string;
}

export interface Decision {
  id: string;
  title: string;
  text: string;
}

export interface ChangeContract {
  id: string;
  title: string;
  intent: string;
  scope: string;
  nonGoals: string;
  architecture: string;
  requirements: Requirement[];
  decisions: Decision[];
  openQuestions: string[];
  raw: string;
  hash: string;
  sections: Record<string, string>;
}

export type ChangePhase =
  'exploring' | 'proposed' | 'forged' | 'executing' | 'closing' | 'archived';
