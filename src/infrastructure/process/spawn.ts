import { spawn } from 'node:child_process';
import { Codes, type ErrorCode } from '../../domain/validation/codes.js';
import { ForgeError } from '../../domain/validation/error.js';
import { redactSecrets } from '../../domain/evidence/fingerprint.js';

export interface SpawnResult {
  argv: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  summary: string;
  timedOut: boolean;
  overflow: boolean;
  cancelled: boolean;
}

const DISALLOWED_SHELL_META = /[;&|`$<>]/;
export const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;

export function assertArgv(argv: unknown, where: string): string[] {
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((item) => typeof item !== 'string')) {
    throw new ForgeError(
      Codes.COMMAND_SHELL,
      `Command at ${where} must be a non-empty argv array of strings.`,
      'Never pass a shell string. Use ["executable", "arg"].',
    );
  }
  const executable = argv[0]!;
  if (executable.includes(' ') || DISALLOWED_SHELL_META.test(executable)) {
    throw new ForgeError(
      Codes.COMMAND_SHELL,
      `Refusing executable '${executable}' at ${where}.`,
      'Pass the executable path as argv[0] without shell metacharacters.',
    );
  }
  return argv;
}

export interface RunArgvOptions {
  cwd: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  maxOutputBytes?: number;
  signal?: AbortSignal;
  timeoutCode?: ErrorCode;
  overflowCode?: ErrorCode;
  cancelCode?: ErrorCode;
}

export async function runArgv(argv: string[], options: RunArgvOptions): Promise<SpawnResult> {
  const safe = assertArgv(argv, 'spawn');
  const [file, ...args] = safe;
  const maxOutput = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (options.signal?.aborted) {
    throw new ForgeError(
      options.cancelCode ?? Codes.TOOL_CANCELLED,
      'Command was cancelled before start.',
    );
  }
  return await new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(file!, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let overflow = false;
    let cancelled = false;

    const finish = (fn: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
      fn();
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      finish(() =>
        reject(
          new ForgeError(
            options.timeoutCode ?? Codes.VALIDATOR_FAILED,
            `Command timed out after ${timeoutMs}ms.`,
            'Increase timeout_ms or fix the hanging command.',
          ),
        ),
      );
    }, timeoutMs);

    const onAbort = (): void => {
      cancelled = true;
      child.kill('SIGKILL');
      finish(() =>
        reject(
          new ForgeError(
            options.cancelCode ?? Codes.TOOL_CANCELLED,
            'Command was cancelled.',
            'Retry the tool when ready.',
          ),
        ),
      );
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const accumulate = (target: 'stdout' | 'stderr', chunk: Buffer): void => {
      const text = chunk.toString('utf8');
      if (target === 'stdout') {
        stdout += text;
      } else {
        stderr += text;
      }
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxOutput) {
        overflow = true;
        child.kill('SIGKILL');
        finish(() =>
          reject(
            new ForgeError(
              options.overflowCode ?? Codes.TOOL_OVERFLOW,
              `Command output exceeded ${maxOutput} bytes.`,
              'Reduce tool output or raise the configured output limit.',
            ),
          ),
        );
      }
    };

    child.stdout.on('data', (chunk: Buffer) => accumulate('stdout', chunk));
    child.stderr.on('data', (chunk: Buffer) => accumulate('stderr', chunk));
    child.on('error', (error) => {
      finish(() =>
        reject(
          new ForgeError(
            Codes.VALIDATOR_FAILED,
            `Failed to spawn ${file}: ${error.message}`,
            'Ensure the executable exists and is on PATH.',
          ),
        ),
      );
    });
    child.on('close', (code) => {
      finish(() => {
        const exitCode = code ?? 1;
        const summary = redactSecrets((stdout + stderr).slice(0, 4000));
        resolve({
          argv: safe,
          exitCode,
          stdout: redactSecrets(stdout),
          stderr: redactSecrets(stderr),
          summary,
          timedOut,
          overflow,
          cancelled,
        });
      });
    });
  });
}
