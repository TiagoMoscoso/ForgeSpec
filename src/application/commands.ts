import { hostname } from 'node:os';
import { parseChangeMarkdown } from '../domain/change/parse.js';
import { assertSealable } from '../domain/change/seal.js';
import { fingerprintFiles } from '../domain/evidence/fingerprint.js';
import {
  isEvidenceFresh,
  type EvidenceRecord,
  type SemanticReview,
} from '../domain/evidence/types.js';
import { assertTestCreationPolicy } from '../domain/policy/tests.js';
import { declaredConflicts, hashPlan, hashTask } from '../domain/task-graph/graph.js';
import { parsePlanDocument } from '../domain/task-graph/parse.js';
import { globMatches } from '../domain/task-graph/globs.js';
import type { Plan, PlanTask } from '../domain/task-graph/types.js';
import { assertTransition, type TaskState } from '../domain/task-state/machine.js';
import { expectedBranch, workspaceMatches } from '../domain/workspace/policy.js';
import { Codes } from '../domain/validation/codes.js';
import { ForgeError } from '../domain/validation/error.js';
import { loadResolvedConfig } from '../infrastructure/config/load.js';
import type { ForgeConfig } from '../infrastructure/config/schema.js';
import { runArgv } from '../infrastructure/process/spawn.js';
import {
  filesMatching,
  readMatchingFiles,
  walkRelativeFiles,
} from '../infrastructure/filesystem/walk.js';
import { gitIdentity, isGitRepo } from '../infrastructure/git/git.js';
import {
  addWaiver,
  allTaskStates,
  appendEvent,
  clearLock,
  currentPlanHash,
  latestEvidence,
  listChangeIds,
  listEvidence,
  loadChange,
  lockExpired,
  readLock,
  readWaivers,
  readWorkspace,
  resolveChangeId,
  runningTasks,
  writeEvidence,
  writeLock,
  writePlan,
  writeRuntime,
  writeSpecSync,
  type LoadedChange,
  type TaskLock,
} from '../infrastructure/runtime/store.js';
import { changeDir } from '../infrastructure/project/layout.js';
import { applyDerivedStates } from './derived-state.js';
import { isSemanticValidator, requiredSemantic, runValidatorList } from './validators.js';
import { parse as parseYaml } from 'yaml';
import { readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { archiveDir } from '../infrastructure/project/layout.js';
import { mkdir } from 'node:fs/promises';

export { parseChangeMarkdown, assertSealable };

function requireLoaded(
  loaded: LoadedChange,
): asserts loaded is LoadedChange & { change: NonNullable<LoadedChange['change']>; plan: Plan } {
  if (!loaded.change) {
    throw new ForgeError(Codes.CHANGE_PARSE, `change.md is missing for ${loaded.changeId}.`);
  }
}

function requireForged(loaded: LoadedChange): asserts loaded is LoadedChange & {
  change: NonNullable<LoadedChange['change']>;
  plan: Plan;
  graph: NonNullable<LoadedChange['graph']>;
} {
  requireLoaded(loaded);
  if (
    !loaded.plan ||
    !loaded.graph ||
    !loaded.runtime.sealed ||
    loaded.runtime.phase === 'exploring'
  ) {
    throw new ForgeError(
      Codes.CHANGE_UNSEALED,
      `Change ${loaded.changeId} is not forged.`,
      'Seal the proposal, write plan.yaml, then run `forgespec forge`.',
    );
  }
}

function taskById(loaded: LoadedChange, taskId: string): PlanTask {
  requireForged(loaded);
  const task = loaded.graph.byId.get(taskId);
  if (!task) {
    throw new ForgeError(
      Codes.TASK_NOT_FOUND,
      `Task ${taskId} does not exist.`,
      'Use an id from plan.yaml.',
    );
  }
  return task;
}

async function statesFor(loaded: LoadedChange): Promise<Record<string, TaskState>> {
  const declared = await allTaskStates(loaded);
  return applyDerivedStates(loaded.plan?.tasks ?? [], declared);
}

async function assertWorkspace(loaded: LoadedChange, cwd: string): Promise<void> {
  const isolation = loaded.config.git.isolation;
  if (isolation === 'none') {
    return;
  }
  if (!(await isGitRepo(cwd))) {
    throw new ForgeError(
      Codes.WORKSPACE_GIT,
      'Git isolation is enabled but this is not a git worktree.',
    );
  }
  const actual = await gitIdentity(cwd);
  const recorded = await readWorkspace(loaded.dir);
  const expected = recorded ?? {
    isolation,
    branch: expectedBranch(loaded.config.git.branch_pattern, loaded.changeId),
    worktree: actual.worktree,
  };
  const match = workspaceMatches(isolation, expected, actual);
  if (!match.ok) {
    throw new ForgeError(
      Codes.WORKSPACE_MISMATCH,
      match.reason,
      'Run `forgespec workspace setup` or switch to the owning worktree.',
    );
  }
}

async function fingerprintTask(root: string, task: PlanTask): Promise<string> {
  const files = await readMatchingFiles(root, task.touches.length > 0 ? task.touches : ['**/*']);
  return fingerprintFiles(files);
}

function attemptId(): string {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
}

export async function proposeSeal(
  root: string,
  changeId: string,
): Promise<{ changeId: string; hash: string }> {
  const loaded = await loadChange(root, changeId);
  if (!loaded.change) {
    throw new ForgeError(
      Codes.CHANGE_PARSE,
      `Missing change.md at forgespec/changes/${changeId}/change.md.`,
    );
  }
  if (loaded.change.id !== changeId) {
    throw new ForgeError(
      Codes.CHANGE_PARSE,
      `change.md id ${loaded.change.id} does not match directory ${changeId}.`,
    );
  }
  assertSealable(loaded.change);
  await writeRuntime(loaded.dir, {
    changeId,
    phase: 'proposed',
    sealed: true,
    changeHash: loaded.change.hash,
    sealedAt: new Date().toISOString(),
  });
  return { changeId, hash: loaded.change.hash };
}

export async function forgeChange(
  root: string,
  changeId: string,
  replan = false,
): Promise<{ planHash: string; waves: string[][] }> {
  const loaded = await loadChange(root, changeId);
  if (!loaded.runtime.sealed || !loaded.change) {
    throw new ForgeError(
      Codes.CHANGE_UNSEALED,
      'Proposal is not sealed.',
      'Run `forgespec propose seal` after change.md is complete.',
    );
  }
  if (loaded.change.hash !== loaded.runtime.changeHash) {
    throw new ForgeError(
      Codes.CHANGE_UNSEALED,
      'change.md has changed since seal.',
      'Re-run `forgespec propose seal` after editing the contract.',
    );
  }
  const raw = await readFile(path.join(loaded.dir, 'plan.yaml'), 'utf8').catch(() => {
    throw new ForgeError(
      Codes.PLAN_INVALID,
      'plan.yaml is missing.',
      'Draft plan.yaml then run `forgespec forge`.',
    );
  });
  const draft = parsePlanDocument(parseYaml(raw));
  if (draft.change_id !== changeId) {
    throw new ForgeError(
      Codes.PLAN_INVALID,
      `plan.yaml change_id ${draft.change_id} does not match ${changeId}.`,
    );
  }
  if (loaded.runtime.planHash && !replan) {
    throw new ForgeError(
      Codes.PLAN_IMMUTABLE,
      'plan.yaml is already sealed.',
      'Use `forgespec forge --replan` to compile a new graph.',
    );
  }
  const states = await statesFor(loaded);
  if (replan && runningTasks(states).length > 0) {
    throw new ForgeError(
      Codes.PLAN_IMMUTABLE,
      'Cannot replan while a task is RUNNING.',
      'Finish or reset running tasks first.',
      { running: runningTasks(states) },
    );
  }
  const previous = loaded.plan;
  const graph = loaded.change
    ? (await import('../domain/task-graph/graph.js')).compileTaskGraph(
        draft,
        loaded.change.requirements,
      )
    : undefined;
  if (!graph) {
    throw new ForgeError(Codes.CHANGE_PARSE, 'Cannot forge without a parsed change.md.');
  }
  const sealed: Plan = {
    ...draft,
    change_hash: loaded.change.hash,
    forged_at: new Date().toISOString(),
  };
  const planHash = hashPlan(sealed);
  await writePlan(loaded.dir, sealed);
  const previousById = new Map((previous?.tasks ?? []).map((task) => [task.id, task]));
  for (const task of sealed.tasks) {
    const priorState = states[task.id];
    const sameBody =
      previousById.has(task.id) && hashTask(previousById.get(task.id)!) === hashTask(task);
    if (priorState === 'ARCHIVED' && sameBody) {
      continue;
    }
    if (priorState === 'RUNNING') {
      continue;
    }
    await appendEvent(loaded.dir, task.id, {
      type: 'forge',
      command: replan ? 'forge --replan' : 'forge',
      from: priorState,
      to: task.depends_on.length === 0 ? 'READY' : 'BLOCKED',
    });
  }
  await writeRuntime(loaded.dir, {
    ...loaded.runtime,
    phase: 'forged',
    planHash,
    forgedAt: sealed.forged_at,
  });
  return { planHash, waves: graph.waves };
}

async function occupyWorktree(loaded: LoadedChange, taskId: string): Promise<void> {
  const states = await statesFor(loaded);
  const running = runningTasks(states).filter((id) => id !== taskId);
  if (running.length > 0) {
    throw new ForgeError(
      Codes.TASK_WORKTREE_BUSY,
      `Worktree already has running task ${running.join(', ')}.`,
      'One task per worktree. Finish or reset it, or use another worktree.',
    );
  }
}

export async function execStart(
  root: string,
  cwd: string,
  changeId: string,
  taskId: string,
): Promise<{ task: PlanTask; context: unknown; state: TaskState }> {
  const loaded = await loadChange(root, changeId);
  requireForged(loaded);
  await assertWorkspace(loaded, cwd);
  const task = taskById(loaded, taskId);
  const states = await statesFor(loaded);
  const state = states[taskId] ?? 'BLOCKED';
  if (state === 'BLOCKED') {
    throw new ForgeError(
      Codes.TASK_BLOCKED,
      `Task ${taskId} is blocked by unmet dependencies.`,
      'Archive/verify dependency tasks first.',
      { depends_on: task.depends_on },
    );
  }
  if (state !== 'READY' && state !== 'FAILED' && state !== 'RUNNING') {
    throw new ForgeError(
      Codes.TASK_NOT_READY,
      `Task ${taskId} is ${state} and cannot be executed.`,
      'Choose a READY (or FAILED retry) task from `forgespec ready`.',
    );
  }
  const existing = await readLock(loaded.dir, taskId);
  if (state === 'RUNNING' && existing && !lockExpired(existing)) {
    throw new ForgeError(
      Codes.TASK_LOCK,
      `Task ${taskId} is already RUNNING.`,
      'Call exec finish, wait for lock TTL, or `forgespec exec reset --reason ...`.',
    );
  }
  if (state !== 'RUNNING') {
    await occupyWorktree(loaded, taskId);
  }
  for (const prereq of task.prerequisites) {
    if (prereq.type === 'manual') {
      throw new ForgeError(
        Codes.TASK_PREREQ,
        `Manual prerequisite: ${prereq.message}`,
        'Resolve the blocker, then re-run exec start.',
      );
    }
    if (prereq.type === 'command' || prereq.type === 'env') {
      if (!prereq.check) {
        throw new ForgeError(Codes.TASK_PREREQ, `Prerequisite is missing argv: ${prereq.message}`);
      }
      const result = await runArgv(prereq.check.argv, {
        cwd,
        timeoutMs: prereq.check.timeout_ms ?? 30_000,
      });
      if (result.exitCode !== 0) {
        throw new ForgeError(
          Codes.TASK_PREREQ,
          prereq.message,
          'Satisfy the prerequisite; do not fabricate completion.',
        );
      }
    }
  }
  const files = await walkRelativeFiles(root);
  const lock: TaskLock = {
    taskId,
    pid: process.pid,
    hostname: hostname(),
    worktree: cwd,
    acquiredAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + loaded.config.workflow.exec.lock_ttl_ms).toISOString(),
    filesAtStart: files,
  };
  await writeLock(loaded.dir, lock);
  if (state !== 'RUNNING') {
    assertTransition(state, 'RUNNING');
    await appendEvent(loaded.dir, taskId, {
      type: 'exec-start',
      command: 'exec start',
      from: state,
      to: 'RUNNING',
    });
  }
  await writeRuntime(loaded.dir, { ...loaded.runtime, phase: 'executing' });
  const context = await taskContext(loaded, task, await statesFor(loaded));
  return { task, context, state: 'RUNNING' };
}

export async function execFinish(
  root: string,
  cwd: string,
  changeId: string,
  taskId: string,
): Promise<EvidenceRecord> {
  const loaded = await loadChange(root, changeId);
  requireForged(loaded);
  await assertWorkspace(loaded, cwd);
  const task = taskById(loaded, taskId);
  const states = await statesFor(loaded);
  if ((states[taskId] ?? 'BLOCKED') !== 'RUNNING') {
    throw new ForgeError(
      Codes.TASK_NOT_READY,
      `Task ${taskId} is not RUNNING.`,
      'Call exec start before exec finish.',
    );
  }
  const lock = await readLock(loaded.dir, taskId);
  const filesAtFinish = await walkRelativeFiles(root);
  const filesAtStart = lock?.filesAtStart ?? [];
  const waivers = await readWaivers(loaded.dir);
  const validatorCtx = {
    root,
    cwd,
    config: loaded.config,
    task,
    states,
    filesAtStart,
    filesAtFinish,
    waivers,
  };
  let validatorRecords;
  try {
    validatorRecords = await runValidatorList(
      task.validators.length > 0 ? task.validators : loaded.config.workflow.exec.validators,
      validatorCtx,
    );
    const focused = loaded.config.workflow.exec.tests.focused_execution;
    if (
      focused === 'required' &&
      !validatorRecords.some((record) => record.name.includes('test'))
    ) {
      validatorRecords.push(...(await runValidatorList(['focused-tests'], validatorCtx)));
    }
    assertTestCreationPolicy({
      creation: loaded.config.workflow.exec.tests.creation,
      focused_execution: loaded.config.workflow.exec.tests.focused_execution,
      testGlobs: loaded.config.project.test_globs,
      filesAtStart,
      filesAtFinish,
      task,
      mandatoryRequirementCount: task.requirements.filter((id) =>
        loaded.change!.requirements.some((req) => req.id === id && req.kind === 'mandatory'),
      ).length,
    });
  } catch (error) {
    await appendEvent(loaded.dir, taskId, {
      type: 'exec-finish',
      command: 'exec finish',
      from: 'RUNNING',
      to: 'FAILED',
      reason: error instanceof ForgeError ? error.message : String(error),
    });
    await clearLock(loaded.dir, taskId);
    throw error;
  }
  const git = (await isGitRepo(cwd))
    ? await gitIdentity(cwd)
    : { sha: 'NOGIT', branch: '', worktree: cwd };
  const evidence: EvidenceRecord = {
    attempt_id: attemptId(),
    task_id: taskId,
    git_sha: git.sha,
    fingerprint: await fingerprintTask(root, task),
    plan_hash: currentPlanHash(loaded.plan!),
    changed_files: filesAtFinish.filter((file) => !filesAtStart.includes(file)),
    validators: validatorRecords,
    tests: filesAtFinish.filter((file) =>
      loaded.config.project.test_globs.some((glob) => globMatches(glob, file)),
    ),
    semanticReviews: [],
    waivers: waivers.filter((waiver) => waiver.task_id === taskId),
    timestamps: {
      startedAt: lock?.acquiredAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    },
    filesAtStart,
    filesAtFinish,
  };
  await writeEvidence(loaded.dir, evidence);
  assertTransition('RUNNING', 'IMPLEMENTED');
  await appendEvent(loaded.dir, taskId, {
    type: 'exec-finish',
    command: 'exec finish',
    from: 'RUNNING',
    to: 'IMPLEMENTED',
  });
  await clearLock(loaded.dir, taskId);
  return evidence;
}

export async function execReset(
  root: string,
  changeId: string,
  taskId: string,
  reason: string,
): Promise<void> {
  const loaded = await loadChange(root, changeId);
  const states = await statesFor(loaded);
  const from = states[taskId];
  if (from !== 'RUNNING' && from !== 'FAILED') {
    throw new ForgeError(
      Codes.TASK_TRANSITION,
      `exec reset requires RUNNING or FAILED, not ${from}.`,
    );
  }
  if (from === 'RUNNING') {
    assertTransition('RUNNING', 'FAILED');
    await appendEvent(loaded.dir, taskId, {
      type: 'exec-reset',
      command: 'exec reset',
      from,
      to: 'FAILED',
      reason,
    });
  }
  await clearLock(loaded.dir, taskId);
}

export async function reviewSubmit(
  root: string,
  changeId: string,
  taskId: string,
  validator: string,
  filePath: string,
): Promise<SemanticReview> {
  const loaded = await loadChange(root, changeId);
  requireForged(loaded);
  if (!isSemanticValidator(validator)) {
    throw new ForgeError(Codes.VALIDATOR_FAILED, `${validator} is not a semantic validator.`);
  }
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as {
    findings?: { critical?: number; warning?: number; suggestion?: number };
  };
  const review: SemanticReview = {
    validator,
    findings: {
      critical: parsed.findings?.critical ?? 0,
      warning: parsed.findings?.warning ?? 0,
      suggestion: parsed.findings?.suggestion ?? 0,
    },
    submittedAt: new Date().toISOString(),
    source: filePath,
  };
  const evidence = await latestEvidence(loaded.dir, taskId);
  if (!evidence) {
    throw new ForgeError(
      Codes.EVIDENCE_MISSING,
      `No evidence for ${taskId}.`,
      'Finish exec before submitting a review.',
    );
  }
  evidence.semanticReviews.push(review);
  await writeEvidence(loaded.dir, { ...evidence, attempt_id: evidence.attempt_id });
  return review;
}

async function requireFreshEvidence(
  loaded: LoadedChange,
  task: PlanTask,
  root: string,
): Promise<EvidenceRecord> {
  const evidence = await latestEvidence(loaded.dir, task.id);
  if (!evidence) {
    throw new ForgeError(
      Codes.EVIDENCE_MISSING,
      `No evidence for ${task.id}.`,
      'Run exec finish so validators are recorded.',
    );
  }
  const fingerprint = await fingerprintTask(root, task);
  const planHash = currentPlanHash(loaded.plan!);
  if (!isEvidenceFresh(evidence, fingerprint, planHash)) {
    throw new ForgeError(
      Codes.EVIDENCE_STALE,
      `Evidence for ${task.id} is stale.`,
      'Re-run exec after code or plan changes.',
      { expectedFingerprint: fingerprint, actual: evidence.fingerprint },
    );
  }
  return evidence;
}

export async function archiveTask(
  root: string,
  cwd: string,
  changeId: string,
  taskId: string,
  waiver?: { validator: string; reason: string },
): Promise<{ state: TaskState }> {
  const loaded = await loadChange(root, changeId);
  requireForged(loaded);
  await assertWorkspace(loaded, cwd);
  const task = taskById(loaded, taskId);
  if (waiver) {
    await addWaiver(loaded.dir, {
      validator: waiver.validator,
      reason: waiver.reason,
      by: process.env.USER ?? 'unknown',
      at: new Date().toISOString(),
      task_id: taskId,
    });
  }
  const states = await statesFor(loaded);
  const state = states[taskId] ?? 'BLOCKED';
  if (state !== 'IMPLEMENTED' && state !== 'VERIFIED') {
    throw new ForgeError(
      Codes.ARCHIVE_INCOMPLETE,
      `Task ${taskId} is ${state}; archive requires IMPLEMENTED evidence.`,
      'Complete exec finish first. Checkboxes are not evidence.',
    );
  }
  const evidence = await requireFreshEvidence(loaded, task, root);
  const waivers = await readWaivers(loaded.dir);
  const filesAtFinish = await walkRelativeFiles(root);
  const archiveValidators =
    task.validators.length > 0
      ? [...new Set([...task.validators, ...loaded.config.workflow.archive.validators])]
      : loaded.config.workflow.archive.validators;
  const semanticNeeded = requiredSemantic(archiveValidators);
  for (const name of semanticNeeded) {
    if (waivers.some((item) => item.validator === name && item.task_id === taskId)) {
      continue;
    }
    const review = evidence.semanticReviews.find((item) => item.validator === name);
    if (!review) {
      throw new ForgeError(
        Codes.VALIDATOR_REVIEW,
        `Semantic validator ${name} has no submitted review for ${taskId}.`,
        `Run the ${name} review and \`forgespec review submit ${taskId} --validator ${name} --file review.json\`.`,
      );
    }
    if (review.findings.critical > 0) {
      throw new ForgeError(
        Codes.VALIDATOR_REVIEW,
        `Semantic validator ${name} still has ${review.findings.critical} critical finding(s).`,
        'Resolve critical findings and submit a new review.',
      );
    }
  }
  if (state === 'IMPLEMENTED') {
    await runValidatorList(
      archiveValidators.filter((name) => !isSemanticValidator(name)),
      {
        root,
        cwd,
        config: loaded.config,
        task,
        states,
        filesAtStart: evidence.filesAtStart,
        filesAtFinish,
        waivers,
      },
    );
    assertTransition('IMPLEMENTED', 'VERIFIED');
    await appendEvent(loaded.dir, taskId, {
      type: 'archive-verify',
      command: 'archive',
      from: 'IMPLEMENTED',
      to: 'VERIFIED',
    });
  }
  try {
    await runArchiveAction(loaded.config, cwd);
  } catch (error) {
    throw new ForgeError(
      Codes.ACTION_FAILED,
      error instanceof Error ? error.message : String(error),
      'Task is VERIFIED. Fix the action and re-run archive to finalize.',
    );
  }
  assertTransition('VERIFIED', 'ARCHIVED');
  await appendEvent(loaded.dir, taskId, {
    type: 'archive',
    command: 'archive',
    from: 'VERIFIED',
    to: 'ARCHIVED',
  });
  return { state: 'ARCHIVED' };
}

async function runArchiveAction(config: ForgeConfig, cwd: string): Promise<void> {
  const action = config.workflow.archive.action;
  if (action.type === 'none') {
    return;
  }
  const argv =
    action.argv ??
    (action.type === 'commit'
      ? ['git', 'commit', '-am', 'forgespec: archive task']
      : action.type === 'push'
        ? ['git', 'push']
        : action.type === 'pull_request'
          ? ['gh', 'pr', 'create', '--fill']
          : undefined);
  if (!argv) {
    throw new ForgeError(Codes.ACTION_FAILED, `Action ${action.type} requires argv.`);
  }
  const result = await runArgv(argv, { cwd, timeoutMs: action.timeout_ms ?? 60_000 });
  if (result.exitCode !== 0) {
    throw new ForgeError(
      Codes.ACTION_FAILED,
      `Action ${action.type} exited ${result.exitCode}: ${result.summary}`,
    );
  }
}

export async function closeChange(root: string, changeId: string): Promise<{ archivedTo: string }> {
  const loaded = await loadChange(root, changeId);
  requireForged(loaded);
  const states = await statesFor(loaded);
  const unfinished = loaded.plan!.tasks.filter((task) => {
    const state = states[task.id];
    return state !== 'ARCHIVED' && state !== 'CANCELLED';
  });
  if (unfinished.length > 0) {
    throw new ForgeError(
      Codes.CLOSE_NOT_READY,
      `Cannot close ${changeId}; unfinished tasks: ${unfinished.map((task) => task.id).join(', ')}.`,
      'Archive every required task first.',
    );
  }
  const payload = {
    changeId,
    requirements: loaded.change!.requirements.map((requirement) => ({
      id: requirement.id,
      title: requirement.title,
      text: requirement.text,
      acceptance: requirement.acceptance,
      kind: requirement.kind,
      capability: requirement.capability,
    })),
  };
  await writeSpecSync(loaded.dir, payload);
  const specFiles = await filesMatching(root, ['forgespec/specs/**/*.md']);
  const specText: string[] = [];
  for (const file of specFiles) {
    specText.push(await readFile(path.join(root, file), 'utf8'));
  }
  const joined = specText.join('\n');
  const missing = loaded
    .change!.requirements.filter((requirement) => requirement.kind === 'mandatory')
    .filter((requirement) => !joined.includes(requirement.id));
  if (missing.length > 0) {
    throw new ForgeError(
      Codes.CLOSE_REQ_LOSS,
      `Durable specs are missing requirement ids: ${missing.map((item) => item.id).join(', ')}.`,
      'Merge change.md requirements into forgespec/specs/ then re-run close. spec-sync.json has the source of truth.',
      { missing: missing.map((item) => item.id) },
    );
  }
  const day = new Date().toISOString().slice(0, 10);
  const dest = path.join(archiveDir(root), `${day}-${changeId}`);
  await mkdir(archiveDir(root), { recursive: true });
  await rename(loaded.dir, dest);
  return { archivedTo: dest };
}

export async function cancelTask(
  root: string,
  changeId: string,
  taskId: string,
  reason: string,
): Promise<void> {
  const loaded = await loadChange(root, changeId);
  const states = await statesFor(loaded);
  const from = states[taskId];
  if (!from || from === 'ARCHIVED') {
    throw new ForgeError(Codes.TASK_TRANSITION, `Cannot cancel ${taskId} from ${from}.`);
  }
  assertTransition(from, 'CANCELLED');
  await appendEvent(loaded.dir, taskId, {
    type: 'cancel',
    command: 'task cancel',
    from,
    to: 'CANCELLED',
    reason,
  });
}

export async function queryStatus(root: string, changeId?: string) {
  const id = await resolveChangeId(root, changeId);
  const loaded = await loadChange(root, id);
  const states = loaded.plan ? await statesFor(loaded) : {};
  return {
    changeId: id,
    phase: loaded.runtime.phase,
    sealed: loaded.runtime.sealed,
    states,
    waves: loaded.graph?.waves ?? [],
    coverage: loaded.graph?.coverage ?? {},
    conflicts: loaded.plan ? declaredConflicts(loaded.plan.tasks) : [],
  };
}

export async function queryGraph(root: string, changeId?: string) {
  const status = await queryStatus(root, changeId);
  return {
    changeId: status.changeId,
    waves: status.waves,
    coverage: status.coverage,
    conflicts: status.conflicts,
    states: status.states,
  };
}

export async function queryReady(root: string, changeId?: string, forClose = false) {
  const status = await queryStatus(root, changeId);
  const ready = Object.entries(status.states)
    .filter(([, state]) => state === 'READY')
    .map(([id]) => id);
  const closeReady =
    Object.keys(status.states).length > 0 &&
    Object.values(status.states).every((state) => state === 'ARCHIVED' || state === 'CANCELLED');
  return { changeId: status.changeId, ready, closeReady: forClose ? closeReady : closeReady };
}

export async function queryEvidence(root: string, changeId: string, taskId: string) {
  const loaded = await loadChange(root, changeId);
  const task = loaded.plan ? taskById(loaded, taskId) : undefined;
  const records = await listEvidence(loaded.dir, taskId);
  const latest = records[records.length - 1];
  let fresh: boolean | undefined;
  if (latest && task) {
    const fingerprint = await fingerprintTask(root, task);
    fresh = isEvidenceFresh(latest, fingerprint, loaded.plan ? currentPlanHash(loaded.plan) : '');
  }
  return { taskId, records, latest, fresh, waivers: await readWaivers(loaded.dir) };
}

export async function taskContext(
  loaded: LoadedChange,
  task: PlanTask,
  states: Record<string, TaskState>,
) {
  const reqs =
    loaded.change?.requirements.filter((requirement) =>
      task.requirements.includes(requirement.id),
    ) ?? [];
  const decisions = loaded.change?.decisions ?? [];
  return {
    changeId: loaded.changeId,
    task,
    requirements: reqs,
    decisions,
    dependencyStates: Object.fromEntries(task.depends_on.map((id) => [id, states[id]])),
    suggestedPaths: task.touches,
    guidance: loaded.config.workflow.explore.guidance,
  };
}

export async function queryContext(root: string, changeId: string, taskId: string) {
  const loaded = await loadChange(root, changeId);
  requireForged(loaded);
  const task = taskById(loaded, taskId);
  const states = await statesFor(loaded);
  return await taskContext(loaded, task, states);
}

export async function queryValidate(root: string, changeId?: string) {
  const config = await loadResolvedConfig(root, changeId);
  const ids = changeId ? [changeId] : await listChangeIds(root);
  const changes = [];
  for (const id of ids) {
    const loaded = await loadChange(root, id);
    if (loaded.change && loaded.plan) {
      changes.push({
        changeId: id,
        planHash: loaded.runtime.planHash,
        phase: loaded.runtime.phase,
      });
    }
  }
  return { ok: true, configVersion: config.version, changes };
}

export async function listChanges(root: string): Promise<string[]> {
  return await listChangeIds(root);
}

export function changePath(root: string, changeId: string): string {
  return changeDir(root, changeId);
}

export type { ForgeConfig, LoadedChange, Plan, PlanTask };
