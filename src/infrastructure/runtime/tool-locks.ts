import { unlink } from 'node:fs/promises';
import path from 'node:path';
import type { ToolExecutionRecord } from '../../domain/evidence/types.js';
import { RESOURCE_NAME_PATTERN } from '../../domain/tools/types.js';
import { Codes } from '../../domain/validation/codes.js';
import { ForgeError } from '../../domain/validation/error.js';
import { readJsonFile, writeJsonAtomic } from '../filesystem/atomic.js';
import { forgespecDir } from '../project/layout.js';

export interface ToolResourceLock {
  resource: string;
  pid: number;
  acquiredAt: string;
  expiresAt: string;
}

export interface StoredToolRun {
  attempt_id: string;
  task_id?: string;
  change_id?: string;
  tool: string;
  fingerprint?: string;
  plan_hash?: string;
  record: ToolExecutionRecord;
}

function toolLockDir(root: string): string {
  return path.join(forgespecDir(root), 'runtime', 'tool-locks');
}

function toolRunDir(changePath: string, taskId: string): string {
  return path.join(changePath, 'runtime', 'tools', taskId);
}

export async function acquireToolResource(
  root: string,
  resource: string,
  ttlMs = 60 * 60 * 1000,
): Promise<void> {
  if (!RESOURCE_NAME_PATTERN.test(resource)) {
    throw new ForgeError(
      Codes.TOOL_RESOURCE,
      `Invalid tool resource name '${resource}'.`,
      'Resource names must be alphanumeric with . _ - only.',
    );
  }
  const file = path.join(toolLockDir(root), `${resource}.json`);
  const existing = await readJsonFile<ToolResourceLock>(file);
  if (existing && Date.parse(existing.expiresAt) > Date.now()) {
    throw new ForgeError(
      Codes.TOOL_RESOURCE,
      `Tool resource '${resource}' is already in use.`,
      'Wait for the other tool run to finish, or retry later.',
      { resource, pid: existing.pid },
    );
  }
  const now = new Date();
  await writeJsonAtomic(file, {
    resource,
    pid: process.pid,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  } satisfies ToolResourceLock);
}

export async function releaseToolResource(root: string, resource: string): Promise<void> {
  const file = path.join(toolLockDir(root), `${resource}.json`);
  try {
    await unlink(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function writeToolRun(changePath: string, run: StoredToolRun): Promise<string> {
  const taskId = run.task_id ?? '_';
  const file = path.join(toolRunDir(changePath, taskId), `${run.attempt_id}.json`);
  await writeJsonAtomic(file, run);
  return file;
}
