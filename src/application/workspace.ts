import path from 'node:path';
import { expectedBranch } from '../domain/workspace/policy.js';
import { Codes } from '../domain/validation/codes.js';
import { ForgeError } from '../domain/validation/error.js';
import {
  addWorktree,
  createBranch,
  gitIdentity,
  gitTopLevel,
  isGitRepo,
} from '../infrastructure/git/git.js';
import { loadChange, writeWorkspace } from '../infrastructure/runtime/store.js';

export async function workspaceSetup(
  root: string,
  cwd: string,
  changeId: string,
  worktreeRel?: string,
): Promise<{ branch: string; worktree: string }> {
  const loaded = await loadChange(root, changeId);
  if (!(await isGitRepo(cwd))) {
    throw new ForgeError(Codes.WORKSPACE_GIT, 'workspace setup requires a git repository.');
  }
  const isolation = loaded.config.git.isolation;
  if (isolation === 'none') {
    throw new ForgeError(
      Codes.WORKSPACE_GIT,
      'git.isolation is none; workspace setup is not required.',
      'Set git.isolation to branch-per-change or worktree-per-change.',
    );
  }
  const branch = expectedBranch(loaded.config.git.branch_pattern, changeId);
  await createBranch(cwd, branch);
  let worktree = (await gitIdentity(cwd)).worktree;
  if (isolation === 'worktree-per-change' && worktreeRel) {
    const top = await gitTopLevel(cwd);
    const dest = path.resolve(top, '..', worktreeRel);
    await addWorktree(cwd, dest, branch);
    worktree = dest;
  }
  await writeWorkspace(loaded.dir, { isolation, branch, worktree });
  return { branch, worktree };
}

export async function workspaceCheck(root: string, cwd: string, changeId: string) {
  const loaded = await loadChange(root, changeId);
  if (loaded.config.git.isolation === 'none') {
    return { ok: true, isolation: 'none' as const };
  }
  const { workspaceMatches } = await import('../domain/workspace/policy.js');
  const actual = await gitIdentity(cwd);
  const recorded = await (
    await import('../infrastructure/runtime/store.js')
  ).readWorkspace(loaded.dir);
  const match = workspaceMatches(loaded.config.git.isolation, recorded, actual);
  if (!match.ok) {
    throw new ForgeError(Codes.WORKSPACE_MISMATCH, match.reason);
  }
  return { ok: true, isolation: loaded.config.git.isolation, ...actual };
}
