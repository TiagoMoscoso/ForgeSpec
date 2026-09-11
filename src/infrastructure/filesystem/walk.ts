import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { globMatches } from '../../domain/task-graph/globs.js';

const SKIP = new Set(['node_modules', 'dist', 'coverage', '.git', '.cursor', '.claude', '.codex']);

export async function walkRelativeFiles(root: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP.has(entry.name) || entry.name.startsWith('.tmp')) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        results.push(path.relative(root, full).replace(/\\/g, '/'));
      }
    }
  }

  await walk(root);
  return results.sort();
}

export async function filesMatching(root: string, globs: string[]): Promise<string[]> {
  const all = await walkRelativeFiles(root);
  if (globs.length === 0) {
    return all;
  }
  return all.filter((file) => globs.some((glob) => globMatches(glob, file)));
}

export async function readMatchingFiles(
  root: string,
  globs: string[],
): Promise<Array<{ path: string; content: string }>> {
  const files = await filesMatching(root, globs);
  const out: Array<{ path: string; content: string }> = [];
  for (const relative of files) {
    const info = await stat(path.join(root, relative));
    if (!info.isFile()) {
      continue;
    }
    const content = await readFile(path.join(root, relative), 'utf8');
    out.push({ path: relative, content });
  }
  return out;
}
