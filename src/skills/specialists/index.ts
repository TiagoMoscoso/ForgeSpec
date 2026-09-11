export interface SpecialistSkill {
  id: string;
  title: string;
  description: string;
  checklist: string[];
}

export const SPECIALISTS: SpecialistSkill[] = [
  {
    id: 'architecture',
    title: 'Architecture',
    description:
      'Boundaries, ownership, and reuse. Use when a change adds a module, a dependency, or a new abstraction, or touches more than one subsystem.',
    checklist: [
      'Identify existing modules/abstractions that already solve part of the problem before proposing a new one.',
      'Name the seams and ownership boundaries: which module owns this behavior, and does that still hold after the change.',
      'Trace dependency direction; flag a new dependency that points the wrong way (e.g. domain importing infrastructure).',
      'Assess cohesion/coupling: does the change strengthen one responsibility or smear it across modules.',
      'Check fit with existing extension points before adding a new one.',
      'Consider deployment/runtime implications (new process, new startup ordering, new config surface).',
      'Challenge architecture that does not fit the repository, even if it is individually reasonable.',
      'Record decisions and rejected alternatives inside change.md Decisions (### DEC-...), not a separate design.md.',
    ],
  },
  {
    id: 'flow',
    title: 'Control and data flow',
    description:
      'Happy/failure paths and state transitions. Use whenever the change adds a new code path, an async boundary, or an external call.',
    checklist: [
      'Describe the happy path as observable behavior, not implementation steps.',
      'Describe the failure path(s): what the caller/user sees when it does not work.',
      'Trace state transitions end to end; look for a state the system can enter but never leave.',
      'Call out async/ordering constraints and where a request can legitimately race another.',
      'Check cancellation and retry behavior where the operation is not instantaneous.',
      'Check idempotency where the operation can be safely retried or replayed.',
      'Identify cleanup/lifetime: what releases resources on both success and failure.',
      'Flag contradictory or incomplete flows (a branch with no described outcome).',
    ],
  },
  {
    id: 'testing',
    title: 'Testing',
    description:
      'Requirement-to-evidence mapping. Use on every change; skip only sub-checks that are genuinely not relevant.',
    checklist: [
      'Map each mandatory requirement to at least one verifiable acceptance criterion.',
      'Choose the right level per requirement: unit, integration, or manual/external verification — do not default to unit tests for everything.',
      'Require failure-path coverage, not just the happy path.',
      'Flag requirements whose only proof would be a human/manual check, and say so explicitly rather than hiding it in acceptance text.',
      'Distinguish deterministic evidence (a test the CLI can run) from a claim that needs semantic review.',
      'Watch for tests that would pass even if the requirement were violated (weak assertions, over-mocking the behavior under test).',
      'Do not recommend a test whose only purpose is a coverage number.',
    ],
  },
  {
    id: 'security',
    title: 'Security',
    description:
      'Trust boundaries and sensitive data. Use when the change touches auth, secrets, user input, file paths, or command/process execution.',
    checklist: [
      'Identify the trust boundary the change crosses (network, process, user input, another tenant).',
      'Check authentication and authorization for every new entry point.',
      'Check input validation at the boundary; do not assume upstream already validated it.',
      'Look for injection risk (shell, SQL, path traversal, template).',
      'Check secret handling: no secrets in logs, evidence, error messages, or committed files.',
      'Check privilege boundaries: does this code now run with more privilege than it needs.',
      'Consider auditability: can a security-relevant action be traced after the fact.',
      'Flag supply-chain concerns only when the change actually adds a new dependency.',
    ],
  },
  {
    id: 'data',
    title: 'Data',
    description:
      'Schema, ownership, and consistency. Use when the change adds or changes persisted state, a schema, or a cache.',
    checklist: [
      'Identify the source of truth for the data this change touches.',
      'State the invariants the data must hold, and who enforces them.',
      'Identify the consistency model (strong, eventual, read-your-writes) and whether the change assumes a stronger one than it gets.',
      'Check transaction boundaries: what must commit or fail together.',
      'Check serialization/format compatibility for anything persisted or transmitted.',
      'Check cache semantics: invalidation, staleness window, and who owns cache correctness.',
      'Check idempotency and duplication/loss risk on retry.',
      'Flag any migration implication and hand off detail to the migration specialist rather than restating it.',
    ],
  },
  {
    id: 'api',
    title: 'API',
    description:
      'External contracts. Use when the change adds or changes a public interface, wire format, or CLI/HTTP surface.',
    checklist: [
      'Check backward compatibility for existing callers; a breaking change must be explicit, not incidental.',
      'Check versioning strategy if the contract changes shape.',
      'Define the error contract: what error is returned for each failure mode, not just the success shape.',
      'Check idempotency and pagination if the endpoint/command can be retried or returns a list.',
      'Check that the contract is fully specified by change.md requirements, not left to the implementation to decide.',
    ],
  },
  {
    id: 'migration',
    title: 'Migration',
    description:
      'Forward/backward compatibility of persisted state and deployments. Use when the change alters schema, data shape, or deployment sequencing.',
    checklist: [
      'Define the forward migration steps and whether they can run online.',
      'Define the rollback path; a migration with no rollback story is a material question, not a detail.',
      'Decide expand/contract phasing explicitly; do not leave dual-read/dual-write as an unstated assumption.',
      'Check version skew: can an old client/consumer still function mid-rollout.',
      'Check deployment order dependencies between this change and anything it depends on or is depended on by.',
      'State what happens to existing data that predates the change.',
    ],
  },
  {
    id: 'observability',
    title: 'Observability',
    description:
      'What must be visible to prove the change worked and to diagnose it when it does not. Use when the change adds a new failure mode or operational behavior.',
    checklist: [
      'Identify what must be observable to confirm the change is working in production, not just in a test.',
      'Identify the failure signals an operator would need to diagnose a problem, before they need them.',
      'Prefer events/metrics that support a decision (alert, dashboard, debugging) over telemetry added for its own sake.',
      'Check correlation: can a specific request/task be traced across the events it produces.',
      'Check cardinality: labels/attributes should not explode (no raw ids, paths, or user content as label values).',
      'Check privacy: no secrets or sensitive content in logs, metrics, or traces.',
      'Do not add telemetry that no one will ever look at or alert on.',
    ],
  },
  {
    id: 'concurrency',
    title: 'Concurrency',
    description:
      'Shared state and parallel execution. Use when the change touches shared mutable state, locks, or can run alongside other tasks/processes.',
    checklist: [
      'Identify shared mutable state and who else can touch it concurrently.',
      'Check for races: two actors reading-then-writing the same state without coordination.',
      'Check locking: what is the lock, what does it protect, and can it deadlock with another lock in the system.',
      'Check ordering assumptions that concurrent execution could violate.',
      'Check retry safety: is a retried operation idempotent, or can it double-apply.',
      'Check reentrancy if the same code path can be invoked recursively or by a retry mid-flight.',
      'For ForgeSpec tasks specifically: does this task declare the touches/locks needed so it cannot silently conflict with a parallel task.',
    ],
  },
  {
    id: 'performance',
    title: 'Performance',
    description:
      'Hot paths and resource budgets. Use only when the change is on a known hot path or the user states a performance requirement — do not invoke speculatively.',
    checklist: [
      'Identify the actual hot path affected; do not analyze code that is not on it.',
      'State the complexity (time/space) of the changed path when it is not obviously O(1)/O(n).',
      'Check I/O: new round-trips, N+1 patterns, or unbounded fan-out.',
      'Check memory: unbounded buffers/collections tied to input size.',
      'Require a budget or benchmark before accepting a performance-motivated design choice — do not accept "should be faster" as evidence.',
      "State what is explicitly out of scope for this change's performance envelope.",
      'Never recommend optimizing a path with no evidence it is hot.',
    ],
  },
  {
    id: 'frontend',
    title: 'Frontend/UI',
    description:
      'User-facing states and interaction. Use when the change touches a UI, CLI output shape a human reads, or another human-facing surface.',
    checklist: [
      'Enumerate states: loading, empty, error, and success — not just the happy render.',
      'Check accessibility for any new interactive element (keyboard reachability, labels, focus order).',
      'Check responsive behavior at minimum and typical viewport widths where relevant.',
      'Check state management: where does UI state live, and can it desync from server/CLI state.',
      'Check API/backend failure behavior as seen by the user, not just by the network layer.',
      'Prefer reusing existing design-system components over introducing a one-off pattern.',
      'Do not reduce the review to visual styling; behavior and state coverage matter more than pixel polish.',
    ],
  },
];

export function getSpecialist(id: string): SpecialistSkill | undefined {
  return SPECIALISTS.find((item) => item.id === id);
}

export function generateSpecialistMarkdown(
  specialist: SpecialistSkill,
  generatedBy: string,
): string {
  const checklist = specialist.checklist.map((item) => `- ${item}`).join('\n');
  return `---
name: specialist-${specialist.id}
description: ${specialist.description}
license: MIT
compatibility: Requires forgespec CLI.
metadata:
  author: forgespec
  version: "1.0"
  generatedBy: "${generatedBy}"
---

# ${specialist.title} specialist

${specialist.description}

${checklist}

This specialist returns reasoning and findings for the parent workflow (forge-explore or forge-propose) to weigh and merge into change.md. It never creates its own standalone document.
`;
}
