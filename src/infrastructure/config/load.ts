import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  assertOverlayAllowlist,
  deepMerge,
  parseConfigDocument,
  type ForgeConfig,
} from './schema.js';
import { CONFIG_REL } from '../project/layout.js';

export async function loadProjectConfig(root: string): Promise<ForgeConfig> {
  const filePath = path.join(root, CONFIG_REL);
  const raw = await readFile(filePath, 'utf8');
  if (raw.length > 256 * 1024) {
    throw new Error('config.yaml exceeds 256KB');
  }
  const parsed = parseYaml(raw);
  return parseConfigDocument(parsed, filePath);
}

export async function loadResolvedConfig(root: string, changeId?: string): Promise<ForgeConfig> {
  const project = await loadProjectConfig(root);
  if (!changeId) {
    return project;
  }
  const overlayPath = path.join(root, 'forgespec', 'changes', changeId, 'config.yaml');
  try {
    const raw = await readFile(overlayPath, 'utf8');
    const overlay = parseYaml(raw);
    assertOverlayAllowlist(overlay, overlayPath);
    const merged = deepMerge(project, overlay);
    return parseConfigDocument(merged, overlayPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return project;
    }
    throw error;
  }
}
