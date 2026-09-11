import { createHash } from 'node:crypto';

export function fingerprintFiles(files: Array<{ path: string; content: string }>): string {
  const hash = createHash('sha256');
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of sorted) {
    hash.update(file.path);
    hash.update('\0');
    hash.update(file.content);
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function redactSecrets(text: string): string {
  return text.replace(
    /((?:TOKEN|SECRET|PASSWORD|KEY|AUTHORIZATION)\s*[:=]\s*)([^\s,;]+)/gi,
    '$1[redacted]',
  );
}

export const SECRET_ENV = /(TOKEN|SECRET|PASSWORD|KEY|AUTHORIZATION)/i;

export function redactEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      continue;
    }
    out[key] = SECRET_ENV.test(key) ? '[redacted]' : value;
  }
  return out;
}
