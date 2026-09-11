import { runArgv } from '../process/spawn.js';
import { Codes } from '../../domain/validation/codes.js';
import { ForgeError } from '../../domain/validation/error.js';

export interface GitStatus {
  sha: string;
  branch: string;
  worktree: string;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await runArgv(['git', ...args], { cwd, timeoutMs: 30_000 });
  if (result.exitCode !== 0) {
    throw new ForgeError(
      Codes.WORKSPACE_GIT,
      `git ${args.join(' ')} failed: ${result.stderr.trim() || result.stdout.trim()}`,
      'ForgeSpec git operations require a git working tree.',
    );
  }
  return result.stdout.trim();
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await git(cwd, ['rev-parse', '--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

export async function gitIdentity(cwd: string): Promise<GitStatus> {
  const sha = await git(cwd, ['rev-parse', 'HEAD']).catch(() => 'UNBORN');
  const branch = await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const worktree = await git(cwd, ['rev-parse', '--show-toplevel']);
  return { sha, branch, worktree };
}

export async function gitTopLevel(cwd: string): Promise<string> {
  return await git(cwd, ['rev-parse', '--show-toplevel']);
}

export async function createBranch(cwd: string, branch: string): Promise<void> {
  const current = await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (current === branch) {
    return;
  }
  const existing = await runArgv(['git', 'rev-parse', '--verify', branch], {
    cwd,
    timeoutMs: 15_000,
  });
  if (existing.exitCode === 0) {
    await git(cwd, ['switch', branch]);
    return;
  }
  await git(cwd, ['switch', '-c', branch]);
}

export async function addWorktree(
  cwd: string,
  worktreePath: string,
  branch: string,
): Promise<void> {
  await git(cwd, ['worktree', 'add', worktreePath, branch]);
}
