export interface ValidatorRecord {
  name: string;
  kind: 'deterministic' | 'semantic';
  argv?: string[];
  exitCode?: number;
  summary: string;
  status: 'passed' | 'failed' | 'waived';
}

export interface WaiverRecord {
  validator: string;
  reason: string;
  by: string;
  at: string;
  task_id: string;
}

export interface SemanticReview {
  validator: string;
  findings: {
    critical: number;
    warning: number;
    suggestion: number;
  };
  submittedAt: string;
  source: string;
}

export interface ToolExecutionRecord {
  tool: string;
  source: { type: 'tool'; id: string };
  execution: {
    status: 'passed' | 'failed' | 'timeout' | 'cancelled';
    exit_code: number;
    duration_ms: number;
  };
  validation?: { type: 'test' | 'command' | 'none' };
  summary: string;
  at: string;
}

export interface EvidenceRecord {
  attempt_id: string;
  task_id: string;
  git_sha: string;
  fingerprint: string;
  plan_hash: string;
  changed_files: string[];
  validators: ValidatorRecord[];
  tests: string[];
  semanticReviews: SemanticReview[];
  waivers: WaiverRecord[];
  timestamps: {
    startedAt: string;
    finishedAt: string;
  };
  filesAtStart: string[];
  filesAtFinish: string[];
  tools?: ToolExecutionRecord[];
}

export function isEvidenceFresh(
  evidence: Pick<EvidenceRecord, 'fingerprint' | 'plan_hash'>,
  currentFingerprint: string,
  currentPlanHash: string,
): boolean {
  return evidence.fingerprint === currentFingerprint && evidence.plan_hash === currentPlanHash;
}
