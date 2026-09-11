import { access } from 'node:fs/promises';
import path from 'node:path';
import { Codes } from '../../domain/validation/codes.js';
import { ForgeError } from '../../domain/validation/error.js';

export const FORGESPEC_DIR = 'forgespec';
export const CONFIG_REL = path.join(FORGESPEC_DIR, 'config.yaml');

export async function findProjectRoot(cwd: string): Promise<string> {
  let current = path.resolve(cwd);
  while (true) {
    try {
      await access(path.join(current, CONFIG_REL));
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        throw new ForgeError(
          Codes.CONFIG_NOT_FOUND,
          'No forgespec/config.yaml found in this directory or its parents.',
          'Run `forgespec init` in the project root.',
        );
      }
      current = parent;
    }
  }
}

export function forgespecDir(root: string): string {
  return path.join(root, FORGESPEC_DIR);
}

export function changesDir(root: string): string {
  return path.join(root, FORGESPEC_DIR, 'changes');
}

export function specsDir(root: string): string {
  return path.join(root, FORGESPEC_DIR, 'specs');
}

export function archiveDir(root: string): string {
  return path.join(root, FORGESPEC_DIR, 'archive');
}

export function changeDir(root: string, changeId: string): string {
  return path.join(changesDir(root), changeId);
}
