#!/usr/bin/env node
// Usage: BRAIN_URL=https://brain.huynle.com BRAIN_TOKEN=... npm run brain:export
// Regenerates src/content/projects/*.md, src/content/now.md and src/assets/brain/* from Brain entries tagged
// `public,site-project` / `public,site-now`. Exits 2 (writing nothing) if the safety lint finds anything.
import { ExportLintError, runExport } from './lib/brain-export.ts';

const baseUrl = process.env.BRAIN_URL;
const token = process.env.BRAIN_TOKEN;
if (!baseUrl || !token) {
  console.error('brain:export needs BRAIN_URL and BRAIN_TOKEN in the environment');
  process.exit(1);
}

try {
  const result = await runExport({ root: process.cwd(), baseUrl, token });
  console.log(
    `brain:export OK: ${result.projects} project(s), now ${result.now ? 'updated from Brain' : 'untouched (no site-now entry)'}; ` +
      `${result.written.length} written, ${result.deleted.length} deleted`,
  );
  for (const f of result.written) console.log(`  wrote   ${f}`);
  for (const f of result.deleted) console.log(`  deleted ${f}`);
} catch (err) {
  if (err instanceof ExportLintError) {
    console.error(err.message);
    process.exit(2);
  }
  console.error(`brain:export FAILED: ${(err as Error).message}`);
  process.exit(1);
}
