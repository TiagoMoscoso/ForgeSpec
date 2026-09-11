import { Command } from 'commander';
import { VERSION } from '../version.js';
import { printError, printResult } from './output.js';
import { findProjectRoot } from '../infrastructure/project/layout.js';
import { ForgeError } from '../domain/validation/error.js';
import { Codes } from '../domain/validation/codes.js';
import {
  archiveTask,
  cancelTask,
  closeChange,
  execFinish,
  execReset,
  execStart,
  forgeChange,
  proposeSeal,
  queryContext,
  queryEvidence,
  queryGraph,
  queryReady,
  queryStatus,
  queryValidate,
  reviewSubmit,
} from '../application/commands.js';
import { initProject, parseTools, updateSkills, TOOL_IDS } from '../application/init.js';
import { workspaceCheck, workspaceSetup } from '../application/workspace.js';
import { getSpecialist, SPECIALISTS } from '../skills/specialists/index.js';
import { resolveChangeId } from '../infrastructure/runtime/store.js';
import { loadResolvedConfig } from '../infrastructure/config/load.js';

async function withJson<T>(json: boolean, fn: () => Promise<T>): Promise<void> {
  try {
    const result = await fn();
    printResult(json, result);
  } catch (error) {
    printError(json, error);
    process.exitCode = 1;
  }
}

function jsonFlag(cmd: Command): boolean {
  return Boolean(cmd.optsWithGlobals().json);
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();
  program
    .name('forgespec')
    .description(
      'Harness for AI software engineering: contracts, task graphs, evidence, and fail-closed delivery.',
    )
    .version(VERSION)
    .option('--json', 'Print one JSON document on stdout', false);

  program
    .command('init')
    .description('Create forgespec/ and generate AI tool skills')
    .option('--tools <ids>', `Comma-separated tools: ${TOOL_IDS.join(',')}`)
    .option('--force', 'Overwrite existing config.yaml', false)
    .action(async (opts: { tools?: string; force?: boolean }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () =>
        initProject(process.cwd(), parseTools(opts.tools), Boolean(opts.force)),
      );
    });

  program
    .command('update')
    .description('Refresh generated skills without touching specs or changes')
    .option('--tools <ids>', `Comma-separated tools: ${TOOL_IDS.join(',')}`)
    .action(async (opts: { tools?: string }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        return updateSkills(root, parseTools(opts.tools));
      });
    });

  program
    .command('status')
    .description('Show change phase and task states')
    .option('--change <id>', 'Change id')
    .action(async (opts: { change?: string }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        return queryStatus(root, opts.change);
      });
    });

  program
    .command('validate')
    .description('Validate config and change artifacts')
    .option('--change <id>', 'Change id')
    .action(async (opts: { change?: string }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        return queryValidate(root, opts.change);
      });
    });

  program
    .command('graph')
    .description('Derived task graph view')
    .option('--change <id>', 'Change id')
    .action(async (opts: { change?: string }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        return queryGraph(root, opts.change);
      });
    });

  program
    .command('waves')
    .description('Derived dependency waves')
    .option('--change <id>', 'Change id')
    .action(async (opts: { change?: string }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        const graph = await queryGraph(root, opts.change);
        return { changeId: graph.changeId, waves: graph.waves };
      });
    });

  program
    .command('ready')
    .description('List READY tasks')
    .option('--change <id>', 'Change id')
    .option('--close', 'Also report whether the change can close', false)
    .action(async (opts: { change?: string; close?: boolean }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        return queryReady(root, opts.change, Boolean(opts.close));
      });
    });

  program
    .command('context')
    .argument('<task>', 'Task id')
    .description('Minimum sufficient context for one task')
    .option('--change <id>', 'Change id')
    .action(async (task: string, opts: { change?: string }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        const changeId = await resolveChangeId(root, opts.change);
        return queryContext(root, changeId, task);
      });
    });

  program
    .command('evidence')
    .argument('<task>', 'Task id')
    .description('Show evidence records for a task')
    .option('--change <id>', 'Change id')
    .action(async (task: string, opts: { change?: string }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        const changeId = await resolveChangeId(root, opts.change);
        return queryEvidence(root, changeId, task);
      });
    });

  const propose = program.command('propose').description('Proposal commands');
  propose
    .command('seal')
    .description('Seal change.md after structural and open-question checks')
    .requiredOption('--change <id>', 'Change id')
    .action(async (opts: { change: string }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        return proposeSeal(root, opts.change);
      });
    });

  program
    .command('forge')
    .description('Compile and seal plan.yaml')
    .requiredOption('--change <id>', 'Change id')
    .option('--replan', 'Replace a sealed plan', false)
    .action(async (opts: { change: string; replan?: boolean }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        return forgeChange(root, opts.change, Boolean(opts.replan));
      });
    });

  const exec = program.command('exec').description('Execute one task');
  exec
    .command('start')
    .argument('<task>', 'Task id')
    .description('Preflight, lock, and mark RUNNING')
    .option('--change <id>', 'Change id')
    .action(async (task: string, opts: { change?: string }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        const changeId = await resolveChangeId(root, opts.change);
        return execStart(root, process.cwd(), changeId, task);
      });
    });
  exec
    .command('finish')
    .argument('<task>', 'Task id')
    .description('Run validators, write evidence, mark IMPLEMENTED or FAILED')
    .option('--change <id>', 'Change id')
    .action(async (task: string, opts: { change?: string }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        const changeId = await resolveChangeId(root, opts.change);
        return execFinish(root, process.cwd(), changeId, task);
      });
    });
  exec
    .command('reset')
    .argument('<task>', 'Task id')
    .description('Release a RUNNING/FAILED lock')
    .requiredOption('--reason <text>', 'Why the reset is needed')
    .option('--change <id>', 'Change id')
    .action(async (task: string, opts: { change?: string; reason: string }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        const changeId = await resolveChangeId(root, opts.change);
        await execReset(root, changeId, task, opts.reason);
        return { task, state: 'FAILED' };
      });
    });

  const review = program.command('review').description('Semantic review evidence');
  review
    .command('submit')
    .argument('<task>', 'Task id')
    .description('Attach a semantic review JSON file to the latest evidence')
    .requiredOption('--validator <name>', 'Semantic validator name')
    .requiredOption('--file <path>', 'Review JSON path')
    .option('--change <id>', 'Change id')
    .action(
      async (
        task: string,
        opts: { validator: string; file: string; change?: string },
        cmd: Command,
      ) => {
        await withJson(jsonFlag(cmd), async () => {
          const root = await findProjectRoot(process.cwd());
          const changeId = await resolveChangeId(root, opts.change);
          return reviewSubmit(root, changeId, task, opts.validator, opts.file);
        });
      },
    );

  program
    .command('archive')
    .argument('<task>', 'Task id')
    .description('Fail-closed verification gate for one task')
    .option('--change <id>', 'Change id')
    .option('--waiver <validator>', 'Validator to waive')
    .option('--reason <text>', 'Auditable waiver reason')
    .action(
      async (
        task: string,
        opts: { change?: string; waiver?: string; reason?: string },
        cmd: Command,
      ) => {
        await withJson(jsonFlag(cmd), async () => {
          const root = await findProjectRoot(process.cwd());
          const changeId = await resolveChangeId(root, opts.change);
          if (opts.waiver && !opts.reason) {
            throw new ForgeError(Codes.ARCHIVE_INCOMPLETE, 'Waiver requires --reason.');
          }
          const waiver =
            opts.waiver && opts.reason
              ? { validator: opts.waiver, reason: opts.reason }
              : undefined;
          return archiveTask(root, process.cwd(), changeId, task, waiver);
        });
      },
    );

  program
    .command('close')
    .description('Finalize a change after all required tasks are ARCHIVED')
    .requiredOption('--change <id>', 'Change id')
    .action(async (opts: { change: string }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        return closeChange(root, opts.change);
      });
    });

  const workspace = program.command('workspace').description('Git isolation');
  workspace
    .command('setup')
    .description('Create branch/worktree for a change')
    .requiredOption('--change <id>', 'Change id')
    .option('--worktree <path>', 'Relative worktree path for worktree-per-change')
    .action(async (opts: { change: string; worktree?: string }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        return workspaceSetup(root, process.cwd(), opts.change, opts.worktree);
      });
    });
  workspace
    .command('check')
    .description('Verify this worktree owns the change')
    .requiredOption('--change <id>', 'Change id')
    .action(async (opts: { change: string }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        return workspaceCheck(root, process.cwd(), opts.change);
      });
    });

  program
    .command('skill')
    .description('Print a specialist checklist (no extra documents)')
    .argument('[name]', 'Specialist id')
    .action(async (name: string | undefined, _opts: unknown, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        if (!name) {
          return { specialists: SPECIALISTS.map((item) => item.id) };
        }
        const specialist = getSpecialist(name);
        if (!specialist) {
          throw new ForgeError(
            Codes.CONFIG_INVALID,
            `Unknown specialist ${name}.`,
            `Use one of: ${SPECIALISTS.map((item) => item.id).join(', ')}`,
          );
        }
        const root = await findProjectRoot(process.cwd()).catch(() => undefined);
        const configured = root ? (await loadResolvedConfig(root)).workflow.propose.skills : [];
        return { ...specialist, configured };
      });
    });

  const task = program.command('task').description('Task lifecycle helpers');
  task
    .command('cancel')
    .argument('<task>', 'Task id')
    .description('Cancel a non-archived task')
    .requiredOption('--reason <text>', 'Why')
    .option('--change <id>', 'Change id')
    .action(async (taskId: string, opts: { reason: string; change?: string }, cmd: Command) => {
      await withJson(jsonFlag(cmd), async () => {
        const root = await findProjectRoot(process.cwd());
        const changeId = await resolveChangeId(root, opts.change);
        await cancelTask(root, changeId, taskId, opts.reason);
        return { task: taskId, state: 'CANCELLED' };
      });
    });

  await program.parseAsync(argv);
}
