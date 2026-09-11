import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { Codes } from '../validation/codes.js';
import { ForgeError } from '../validation/error.js';
import type { ChangeContract, Decision, Requirement, RequirementKind } from './types.js';

const REQ_HEADER = /^###\s+(REQ-[A-Z0-9-]+):\s*(.+)\s*$/;
const DEC_HEADER = /^###\s+(DEC-[A-Z0-9-]+):\s*(.+)\s*$/;

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[:]/g, '');
}

function sectionKey(name: string): string {
  return normalizeName(name);
}

function isOpenQuestionsHeading(name: string): boolean {
  const n = sectionKey(name);
  return n === 'open questions' || n === 'open question';
}

function isRequirementsHeading(name: string): boolean {
  return sectionKey(name) === 'requirements';
}

function isDecisionsHeading(name: string): boolean {
  const n = sectionKey(name);
  return n === 'decisions' || n === 'important decisions';
}

function splitFrontmatter(raw: string): { frontmatter: string | undefined; body: string } {
  if (!raw.startsWith('---')) {
    return { frontmatter: undefined, body: raw };
  }
  const rest = raw.slice(3);
  const end = rest.indexOf('\n---');
  if (end === -1) {
    throw new ForgeError(
      Codes.CHANGE_PARSE,
      'change.md frontmatter is not closed.',
      'Start the file with YAML between --- delimiters, including id and title.',
    );
  }
  const frontmatter = rest.slice(0, end).trim();
  const body = rest.slice(end + 4).replace(/^\s*\n/, '');
  return { frontmatter, body };
}

function parseSections(body: string): Record<string, string> {
  const lines = body.split(/\r?\n/);
  const sections: Record<string, string> = {};
  let current = '_preamble';
  const buckets: Record<string, string[]> = { _preamble: [] };

  for (const line of lines) {
    const heading = /^(#{1,2})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = heading[2] ?? '_preamble';
      buckets[current] = buckets[current] ?? [];
      continue;
    }
    buckets[current] = buckets[current] ?? [];
    buckets[current]!.push(line);
  }

  for (const [name, value] of Object.entries(buckets)) {
    sections[name] = value.join('\n').trim();
  }
  return sections;
}

function findSection(sections: Record<string, string>, aliases: string[]): string | undefined {
  const wanted = new Set(aliases.map(sectionKey));
  for (const [name, value] of Object.entries(sections)) {
    if (wanted.has(sectionKey(name))) {
      return value;
    }
  }
  return undefined;
}

function parseListItems(text: string): string[] {
  const items: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*-\s+(.+)\s*$/.exec(line);
    if (match?.[1]) {
      items.push(match[1].trim());
    }
  }
  return items;
}

function parseKind(value: string | undefined): RequirementKind {
  const normalized = (value ?? 'mandatory').trim().toLowerCase();
  if (normalized === 'optional') {
    return 'optional';
  }
  if (normalized === 'mandatory') {
    return 'mandatory';
  }
  throw new ForgeError(
    Codes.CHANGE_PARSE,
    `Invalid requirement kind '${value}'.`,
    'Use Kind: mandatory or Kind: optional.',
  );
}

function parseRequirementBlock(block: string): Requirement {
  const lines = block.split(/\r?\n/);
  const header = REQ_HEADER.exec(lines[0] ?? '');
  if (!header) {
    throw new ForgeError(
      Codes.CHANGE_PARSE,
      'Requirement block is missing a ### REQ-... header.',
      'Use headings like ### REQ-AUTH-001: Title.',
    );
  }
  const id = header[1]!;
  const title = header[2]!;
  const bodyLines: string[] = [];
  let acceptanceRaw = '';
  let kindRaw: string | undefined;
  let capability: string | undefined;
  let mode: 'body' | 'acceptance' = 'body';

  for (const line of lines.slice(1)) {
    if (/^acceptance\s*:?\s*$/i.test(line.trim())) {
      mode = 'acceptance';
      continue;
    }
    const kindMatch = /^kind\s*:\s*(.+)\s*$/i.exec(line.trim());
    if (kindMatch) {
      kindRaw = kindMatch[1];
      mode = 'body';
      continue;
    }
    const capMatch = /^capability\s*:\s*(.+)\s*$/i.exec(line.trim());
    if (capMatch) {
      capability = capMatch[1]?.trim();
      mode = 'body';
      continue;
    }
    if (mode === 'acceptance') {
      acceptanceRaw += `${line}\n`;
    } else {
      bodyLines.push(line);
    }
  }

  const acceptance = parseListItems(acceptanceRaw);
  return {
    id,
    title,
    text: bodyLines.join('\n').trim(),
    acceptance,
    kind: parseKind(kindRaw),
    ...(capability ? { capability } : {}),
  };
}

function parseRequirements(section: string): Requirement[] {
  const lines = section.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (REQ_HEADER.test(line)) {
      if (current.length > 0) {
        blocks.push(current.join('\n'));
      }
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) {
    blocks.push(current.join('\n'));
  }
  return blocks.map(parseRequirementBlock);
}

function parseDecisions(section: string | undefined): Decision[] {
  if (!section) {
    return [];
  }
  const lines = section.split(/\r?\n/);
  const decisions: Decision[] = [];
  let current: { id: string; title: string; body: string[] } | undefined;
  for (const line of lines) {
    const header = DEC_HEADER.exec(line);
    if (header) {
      if (current) {
        decisions.push({
          id: current.id,
          title: current.title,
          text: current.body.join('\n').trim(),
        });
      }
      current = { id: header[1]!, title: header[2]!, body: [] };
      continue;
    }
    if (current) {
      current.body.push(line);
    }
  }
  if (current) {
    decisions.push({ id: current.id, title: current.title, text: current.body.join('\n').trim() });
  }
  return decisions;
}

function parseOpenQuestions(section: string | undefined): string[] {
  if (!section) {
    return [];
  }
  const trimmed = section.trim();
  if (trimmed === '' || /^(none\.?|n\/a|no open questions\.?)$/i.test(trimmed)) {
    return [];
  }
  const items = parseListItems(trimmed);
  if (items.length > 0) {
    return items.filter((item) => !/^(none|n\/a)$/i.test(item));
  }
  return [trimmed];
}

export function hashChangeSource(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function parseChangeMarkdown(raw: string): ChangeContract {
  const { frontmatter, body } = splitFrontmatter(raw);
  if (!frontmatter) {
    throw new ForgeError(
      Codes.CHANGE_PARSE,
      'change.md must start with YAML frontmatter.',
      'Add ---\\nid: kebab-id\\ntitle: Human title\\n---',
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(frontmatter);
  } catch (error) {
    throw new ForgeError(
      Codes.CHANGE_PARSE,
      'change.md frontmatter is not valid YAML.',
      'Fix the YAML between the --- delimiters.',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ForgeError(
      Codes.CHANGE_PARSE,
      'change.md frontmatter must be a mapping with id and title.',
    );
  }

  const record = parsed as Record<string, unknown>;
  const id = record.id;
  const title = record.title;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new ForgeError(
      Codes.CHANGE_PARSE,
      'change.md id must be kebab-case (lowercase letters, digits, hyphens).',
      'Example: id: add-token-validator',
    );
  }
  if (typeof title !== 'string' || title.trim() === '') {
    throw new ForgeError(Codes.CHANGE_PARSE, 'change.md frontmatter title is required.');
  }

  const sections = parseSections(body);
  const intent = findSection(sections, ['Intent', 'Why']);
  const scope = findSection(sections, ['Scope']);
  const reqSection = Object.entries(sections).find(([name]) => isRequirementsHeading(name))?.[1];
  const openSection = Object.entries(sections).find(([name]) => isOpenQuestionsHeading(name))?.[1];
  const decisionSection = Object.entries(sections).find(([name]) => isDecisionsHeading(name))?.[1];

  if (intent === undefined) {
    throw new ForgeError(
      Codes.CHANGE_PARSE,
      'change.md is missing an Intent (or Why) section.',
      'Add a # Intent section describing why the change exists.',
    );
  }
  if (scope === undefined) {
    throw new ForgeError(Codes.CHANGE_PARSE, 'change.md is missing a Scope section.');
  }
  if (reqSection === undefined) {
    throw new ForgeError(Codes.CHANGE_PARSE, 'change.md is missing a Requirements section.');
  }

  const requirements = parseRequirements(reqSection);
  if (requirements.length === 0) {
    throw new ForgeError(
      Codes.CHANGE_PARSE,
      'change.md Requirements section has no REQ-... headings.',
      'Add at least one ### REQ-001: Title block.',
    );
  }

  const seen = new Set<string>();
  for (const requirement of requirements) {
    if (seen.has(requirement.id)) {
      throw new ForgeError(
        Codes.CHANGE_PARSE,
        `Duplicate requirement id ${requirement.id}.`,
        'Requirement IDs must be unique.',
      );
    }
    seen.add(requirement.id);
  }

  return {
    id,
    title: title.trim(),
    intent,
    scope,
    nonGoals: findSection(sections, ['Non-goals', 'Non goals', 'Non-Goals']) ?? '',
    architecture: findSection(sections, ['Architecture']) ?? '',
    requirements,
    decisions: parseDecisions(decisionSection),
    openQuestions: parseOpenQuestions(openSection),
    raw,
    hash: hashChangeSource(raw),
    sections,
  };
}
