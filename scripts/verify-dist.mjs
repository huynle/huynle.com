#!/usr/bin/env node
// Usage: node scripts/verify-dist.mjs [dist]
// Fails (exit 1) if the built site contains a draft post, private addresses, emails, or secret-looking strings.
import { readFile } from 'node:fs/promises';
import { extname, relative } from 'node:path';
import { walk } from './lib/walk.mjs';
import { draftSlugs, scanPath, scanText } from './lib/scan.mjs';

const TEXT_EXTENSIONS = new Set(['.html', '.xml', '.txt', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest', '.map']);

const distDir = process.argv[2] ?? 'dist';
const postsDir = 'src/content/posts';

const postFiles = (await walk(postsDir)).filter((f) => /\.mdx?$/.test(f));
const slugs = draftSlugs(
  await Promise.all(postFiles.map(async (path) => ({ path, content: await readFile(path, 'utf8') }))),
);

const files = await walk(distDir);
let scanned = 0;
const problems = [];
for (const file of files) {
  const rel = relative(distDir, file);
  for (const f of scanPath(rel, slugs)) problems.push({ file: rel, ...f });
  if (!TEXT_EXTENSIONS.has(extname(file))) continue;
  scanned++;
  for (const f of scanText(await readFile(file, 'utf8'), { draftSlugs: slugs })) problems.push({ file: rel, ...f });
}

if (problems.length > 0) {
  console.error(`verify:dist FAILED: ${problems.length} finding(s)`);
  for (const p of problems) console.error(`  ${p.file}: [${p.rule}] ${p.match}`);
  process.exit(1);
}
console.log(
  `verify:dist OK: ${files.length} files (${scanned} text) clean; ${slugs.length} draft slug(s) checked: ${slugs.join(', ') || 'none'}`,
);
