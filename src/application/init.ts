import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultConfigYaml } from '../infrastructure/config/schema.js';
import {
  archiveDir,
  changesDir,
  forgespecDir,
  specsDir,
} from '../infrastructure/project/layout.js';
import { generateToolFiles, type ToolId } from '../integrations/agents/generate.js';

export const TOOL_IDS: ToolId[] = ['cursor', 'claude', 'codex'];

export function parseTools(value: string | undefined): ToolId[] {
  if (!value) {
    return [...TOOL_IDS];
  }
  const ids = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const unknown = ids.filter((id) => !TOOL_IDS.includes(id as ToolId));
  if (unknown.length > 0) {
    throw new Error(`Unknown tools: ${unknown.join(', ')}. Supported: ${TOOL_IDS.join(', ')}`);
  }
  return ids as ToolId[];
}

async function writeIfAbsent(
  filePath: string,
  contents: string,
  force: boolean,
): Promise<'created' | 'refreshed' | 'skipped'> {
  try {
    await readFile(filePath, 'utf8');
    if (!force) {
      return 'skipped';
    }
  } catch {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, 'utf8');
    return 'created';
  }
  await writeFile(filePath, contents, 'utf8');
  return 'refreshed';
}

export async function initProject(
  cwd: string,
  tools: ToolId[],
  force = false,
): Promise<{ created: string[]; refreshed: string[]; skipped: string[] }> {
  const created: string[] = [];
  const refreshed: string[] = [];
  const skipped: string[] = [];
  await mkdir(changesDir(cwd), { recursive: true });
  await mkdir(specsDir(cwd), { recursive: true });
  await mkdir(archiveDir(cwd), { recursive: true });
  const configStatus = await writeIfAbsent(
    path.join(forgespecDir(cwd), 'config.yaml'),
    defaultConfigYaml(),
    force,
  );
  const configRel = 'forgespec/config.yaml';
  if (configStatus === 'created') created.push(configRel);
  else if (configStatus === 'refreshed') refreshed.push(configRel);
  else skipped.push(configRel);

  const generated = generateToolFiles(tools);
  for (const file of generated) {
    const abs = path.join(cwd, file.relativePath);
    const status = await writeIfAbsent(abs, file.contents, true);
    if (status === 'created') created.push(file.relativePath);
    else refreshed.push(file.relativePath);
  }
  return { created, refreshed, skipped };
}

export async function updateSkills(cwd: string, tools: ToolId[]): Promise<{ refreshed: string[] }> {
  const generated = generateToolFiles(tools);
  const refreshed: string[] = [];
  for (const file of generated) {
    const abs = path.join(cwd, file.relativePath);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, file.contents, 'utf8');
    refreshed.push(file.relativePath);
  }
  return { refreshed };
}
