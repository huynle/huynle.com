#!/usr/bin/env node
// Usage: node scripts/check-links.mjs [dist]
// Offline check: every internal href/src in the built HTML must resolve to a file in dist/. No network.
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { checkLinks } from './lib/links.mjs';
import { walk } from './lib/walk.mjs';

const SITE = 'https://huynle.com';
const distDir = process.argv[2] ?? 'dist';


const htmlFiles = (await walk(distDir)).filter((f) => f.endsWith('.html'));
const pages = await Promise.all(
  htmlFiles.map(async (f) => ({ rel: relative(distDir, f), html: await readFile(f, 'utf8') })),
);
const exists = (rel) => {
  const p = join(distDir, rel);
  return existsSync(p) && statSync(p).isFile();
};

const broken = checkLinks(pages, exists, SITE);
if (broken.length > 0) {
  console.error(`check:links FAILED: ${broken.length} broken internal link(s)`);
  for (const b of broken) console.error(`  ${b.from} -> ${b.link}`);
  process.exit(1);
}
console.log(`check:links OK: ${pages.length} pages, all internal links resolve`);
