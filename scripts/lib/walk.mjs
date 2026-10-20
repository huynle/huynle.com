import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Recursively list files under `dir`. */
export async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])),
  );
  return files.flat();
}
