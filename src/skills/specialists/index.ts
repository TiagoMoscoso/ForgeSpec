export interface SpecialistSkill {
  id: string;
  title: string;
  checklist: string[];
}

export const SPECIALISTS: SpecialistSkill[] = [
  {
    id: 'architecture',
    title: 'Architecture',
    checklist: [
      'Identify existing modules that already solve part of the problem.',
      'Name the seams, ownership boundaries, and likely coupling.',
      'Record decisions and rejected alternatives in change.md, not a separate design.md.',
    ],
  },
  {
    id: 'flow',
    title: 'Control and data flow',
    checklist: [
      'Describe the happy path and failure path as observable behavior.',
      'Call out async/ordering constraints that tasks must respect.',
    ],
  },
  {
    id: 'testing',
    title: 'Testing',
    checklist: [
      'Map each mandatory requirement to a verifiable acceptance criterion.',
      'Note whether focused tests, integration tests, or a lab environment are required.',
    ],
  },
  {
    id: 'security',
    title: 'Security',
    checklist: [
      'Threats, trust boundaries, and sensitive data handling.',
      'Authn/authz, injection, and secret exposure risks.',
    ],
  },
  {
    id: 'data',
    title: 'Data',
    checklist: [
      'Schema changes, migrations, and compatibility.',
      'Idempotency and loss/duplication risks.',
    ],
  },
  {
    id: 'api',
    title: 'API',
    checklist: [
      'Compatibility, versioning, error contracts.',
      'Idempotency and pagination if relevant.',
    ],
  },
  {
    id: 'migration',
    title: 'Migration',
    checklist: [
      'Expand/contract steps, rollback, and backfill.',
      'Do not leave dual-write as an unstated assumption.',
    ],
  },
  {
    id: 'observability',
    title: 'Observability',
    checklist: [
      'Logs, metrics, traces needed to prove the change worked.',
      'Failure signals operators will see.',
    ],
  },
  {
    id: 'concurrency',
    title: 'Concurrency',
    checklist: ['Races, locking, and idempotent retries.', 'What must not run in parallel.'],
  },
  {
    id: 'performance',
    title: 'Performance',
    checklist: ['Budgets, hot paths, and load assumptions.', 'What is explicitly out of scope.'],
  },
  {
    id: 'frontend',
    title: 'Frontend/UI',
    checklist: [
      'States (loading, empty, error), accessibility, and responsive behavior.',
      'What must be verified visually vs with tests.',
    ],
  },
];

export function getSpecialist(id: string): SpecialistSkill | undefined {
  return SPECIALISTS.find((item) => item.id === id);
}
