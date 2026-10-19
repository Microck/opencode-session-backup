import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

function canonicalFuturePath(path: string): string {
  let existing = resolve(path);
  const suffix: string[] = [];
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) throw new Error("Cannot resolve backup path");
    suffix.unshift(relative(parent, existing));
    existing = parent;
  }
  return join(realpathSync(existing), ...suffix);
}

export function assertSeparateTrees(source: string, destination: string): void {
  const from = canonicalFuturePath(source);
  const to = canonicalFuturePath(destination);
  const contains = (parent: string, child: string) => {
    const path = relative(parent, child);
    return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
  };
  if (contains(from, to) || contains(to, from)) {
    throw new Error("Backup and session source must be separate directory trees");
  }
}
