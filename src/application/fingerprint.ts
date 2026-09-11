import { fingerprintFiles } from '../domain/evidence/fingerprint.js';
import type { PlanTask } from '../domain/task-graph/types.js';
import { readMatchingFiles } from '../infrastructure/filesystem/walk.js';

export async function fingerprintTask(root: string, task: PlanTask): Promise<string> {
  const files = await readMatchingFiles(root, task.touches.length > 0 ? task.touches : ['**/*']);
  return fingerprintFiles(files);
}

export function attemptId(prefix = 'ev'): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  return `${prefix}_${stamp}`;
}
