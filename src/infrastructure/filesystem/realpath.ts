import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { Codes } from '../../domain/validation/codes.js';
import { ForgeError } from '../../domain/validation/error.js';
import { assertPathWithin } from './paths.js';

export async function assertRealPathWithin(root: string, target: string): Promise<string> {
  const resolvedRoot = await realpath(root);
  let resolvedTarget: string;
  try {
    resolvedTarget = await realpath(target);
  } catch {
    const parent = path.dirname(target);
    const realParent = await realpath(parent).catch(() => path.resolve(parent));
    resolvedTarget = path.join(realParent, path.basename(target));
  }
  return assertPathWithin(resolvedRoot, resolvedTarget);
}

export function requireProjectFile(root: string, relative: string, what: string): string {
  try {
    return assertPathWithin(root, path.join(root, relative));
  } catch {
    throw new ForgeError(Codes.PATH_ESCAPE, `${what} path is not inside the project.`);
  }
}
