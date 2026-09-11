import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);

function readVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkg = require(path.join(here, '..', 'package.json')) as { version: string };
  return pkg.version;
}

export const VERSION = readVersion();
