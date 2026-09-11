import path from 'node:path';
import { Codes } from '../../domain/validation/codes.js';
import { ForgeError } from '../../domain/validation/error.js';

export function assertPathWithin(root: string, target: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(rootWithSep)) {
    throw new ForgeError(
      Codes.PATH_ESCAPE,
      `Path ${target} escapes project root ${root}.`,
      'Use paths inside the project. Traversal and symlink escapes are rejected.',
    );
  }
  return resolvedTarget;
}

export function containsTraversal(relative: string): boolean {
  const parts = relative.replace(/\\/g, '/').split('/');
  return parts.includes('..');
}

export function safeJoin(root: string, ...segments: string[]): string {
  for (const segment of segments) {
    if (containsTraversal(segment) || path.isAbsolute(segment)) {
      throw new ForgeError(
        Codes.PATH_ESCAPE,
        `Refusing path segment '${segment}'.`,
        'Paths must be relative and stay inside the project root.',
      );
    }
  }
  return assertPathWithin(root, path.join(root, ...segments));
}
