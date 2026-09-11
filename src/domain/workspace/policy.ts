export type IsolationMode = 'none' | 'branch-per-change' | 'worktree-per-change';

export interface WorkspaceRecord {
  isolation: IsolationMode;
  branch: string;
  worktree: string;
}

export interface GitIdentity {
  branch: string;
  worktree: string;
}

export function expectedBranch(pattern: string, changeId: string): string {
  return pattern.replaceAll('<change-id>', changeId);
}

export function workspaceMatches(
  isolation: IsolationMode,
  expected: WorkspaceRecord | undefined,
  actual: GitIdentity,
): { ok: true } | { ok: false; reason: string } {
  if (isolation === 'none') {
    return { ok: true };
  }
  if (!expected) {
    return {
      ok: false,
      reason: 'No workspace record. Run `forgespec workspace setup --change <id>` first.',
    };
  }
  if (actual.branch !== expected.branch) {
    return {
      ok: false,
      reason: `Expected branch ${expected.branch} but this worktree is on ${actual.branch}.`,
    };
  }
  if (isolation === 'worktree-per-change' && actual.worktree !== expected.worktree) {
    return {
      ok: false,
      reason: `Expected worktree ${expected.worktree} but running in ${actual.worktree}.`,
    };
  }
  return { ok: true };
}
