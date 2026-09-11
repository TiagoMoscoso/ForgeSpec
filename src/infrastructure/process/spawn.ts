import { spawn } from 'node:child_process';
import { Codes } from '../../domain/validation/codes.js';
import { ForgeError } from '../../domain/validation/error.js';
import { redactSecrets } from '../../domain/evidence/fingerprint.js';

export interface SpawnResult {
  argv: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  summary: string;
}

const DISALLOWED_SHELL_META = /[;&|`$<>]/;

export function assertArgv(argv: unknown, where: string): string[] {
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((item) => typeof item !== 'string')) {
    throw new ForgeError(
      Codes.COMMAND_SHELL,
      `Command at ${where} must be a non-empty argv array of strings.`,
      'Never pass a shell string. Use ["executable", "arg"].',
    );
  }
  const executable = argv[0]!;
  if (executable.includes(' ') && DISALLOWED_SHELL_META.test(executable)) {
    throw new ForgeError(
      Codes.COMMAND_SHELL,
      `Refusing executable '${executable}' at ${where}.`,
      'Pass the executable path as argv[0] without shell metacharacters.',
    );
  }
  return argv;
}

export async function runArgv(
  argv: string[],
  options: { cwd: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<SpawnResult> {
  const safe = assertArgv(argv, 'spawn');
  const [file, ...args] = safe;
  return await new Promise((resolve, reject) => {
    const child = spawn(file!, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new ForgeError(
          Codes.VALIDATOR_FAILED,
          `Command timed out after ${options.timeoutMs ?? 120_000}ms: ${safe.join(' ')}`,
          'Increase timeout_ms or fix the hanging command.',
        ),
      );
    }, options.timeoutMs ?? 120_000);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(
        new ForgeError(
          Codes.VALIDATOR_FAILED,
          `Failed to spawn ${file}: ${error.message}`,
          'Ensure the executable exists and is on PATH.',
        ),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      const exitCode = code ?? 1;
      const summary = redactSecrets((stdout + stderr).slice(0, 4000));
      resolve({
        argv: safe,
        exitCode,
        stdout: redactSecrets(stdout),
        stderr: redactSecrets(stderr),
        summary,
      });
    });
  });
}
