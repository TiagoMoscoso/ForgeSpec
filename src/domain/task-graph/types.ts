export type TaskKind = 'implement' | 'test' | 'docs' | 'spike' | 'manual';

export type DependsOnState = 'verified' | 'implemented';

export type TestPolicyName =
  'required' | 'optional' | 'forbidden' | 'when_missing' | 'when_behavior_changes';

export interface CommandCheck {
  argv: string[];
  timeout_ms?: number;
}

export interface Prerequisite {
  type: 'env' | 'manual' | 'command';
  check?: CommandCheck;
  message: string;
}

export interface PlanTask {
  id: string;
  title: string;
  kind: TaskKind;
  requirements: string[];
  depends_on: string[];
  acceptance: string[];
  validators: string[];
  touches: string[];
  locks: string[];
  prerequisites: Prerequisite[];
  depends_on_state?: DependsOnState;
  tests?: {
    creation?: TestPolicyName;
    focused_execution?: TestPolicyName;
  };
}

export interface Plan {
  version: 1;
  change_id: string;
  change_hash?: string;
  forged_at?: string;
  tasks: PlanTask[];
}

export interface TaskGraph {
  plan: Plan;
  byId: Map<string, PlanTask>;
  waves: string[][];
  coverage: Record<string, string[]>;
}
