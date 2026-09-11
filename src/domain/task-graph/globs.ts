export function globPrefix(glob: string): string {
  return glob
    .replace(/\\/g, '/')
    .replace(/\/\*\*.*$/, '')
    .replace(/\/\*[^*]*$/, '')
    .replace(/\*.*$/, '');
}

export function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, '/');
  let pattern = '';
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char === '*' && normalized[i + 1] === '*') {
      pattern += '.*';
      i += 1;
      if (normalized[i + 1] === '/') {
        i += 1;
      }
    } else if (char === '*') {
      pattern += '[^/]*';
    } else if (char === '?') {
      pattern += '[^/]';
    } else {
      pattern += (char ?? '').replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${pattern}$`);
}

export function expandBraces(glob: string): string[] {
  const match = /\{([^}]+)\}/.exec(glob);
  if (!match || match.index === undefined) {
    return [glob];
  }
  const parts = match[1]!.split(',');
  const expanded: string[] = [];
  for (const part of parts) {
    const next = `${glob.slice(0, match.index)}${part}${glob.slice(match.index + match[0].length)}`;
    expanded.push(...expandBraces(next));
  }
  return expanded;
}

export function globMatches(glob: string, filePath: string): boolean {
  const path = filePath.replace(/\\/g, '/');
  return expandBraces(glob).some((pattern) => {
    const regex = globToRegExp(pattern);
    if (regex.test(path)) {
      return true;
    }
    if (pattern.endsWith('/**')) {
      const prefix = globPrefix(pattern);
      return path === prefix || path.startsWith(`${prefix}/`);
    }
    return false;
  });
}

export function globsOverlap(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }
  const a = globPrefix(left);
  const b = globPrefix(right);
  if (a === '' || b === '') {
    return true;
  }
  return (
    a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`) || a.startsWith(b) || b.startsWith(a)
  );
}
