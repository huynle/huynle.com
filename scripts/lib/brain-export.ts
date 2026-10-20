/**
 * Brain → site export: turns Brain entries tagged `public,site-project` / `public,site-now` into the generated
 * `src/content/projects/*.md`, `src/content/now.md` and `src/assets/brain/*` files.
 *
 * Fail closed: every exported entry is linted for private addresses, internal hostnames, emails and secret-looking
 * strings BEFORE anything is downloaded or written. Output is deterministic so an unchanged Brain yields no diff.
 *
 * Erasable TypeScript only (runs under `node` type stripping and vitest).
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { scanText } from './scan.mjs';

export type BrainEntry = {
  id: string;
  title: string;
  status: string;
  content: string;
  modified: string;
  tags: string[];
  project_id?: string;
};

export type SiteStatus = 'active' | 'paused' | 'shipped';
export type Link = { label: string; url: string };
export type Finding = { id: string; rule: string };

export type FetchOptions = {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
  pageSize?: number;
  maxPages?: number;
};

export type ExportOptions = FetchOptions & { root: string };
export type ExportResult = { written: string[]; deleted: string[]; projects: number; now: boolean };

export const PROJECT_TAGS = ['public', 'site-project'];
export const NOW_TAGS = ['public', 'site-now'];
export const PROJECTS_DIR = 'src/content/projects';
export const NOW_FILE = 'src/content/now.md';
export const ASSETS_DIR = 'src/assets/brain';

/** Thrown when an exported entry trips a safety rule. Carries entry ids and rule names only, never the match. */
export class ExportLintError extends Error {
  findings: Finding[];
  constructor(findings: Finding[]) {
    super(
      `Brain export blocked by the safety lint (${findings.length} finding(s)); nothing was written.\n` +
        findings.map((f) => `  entry ${f.id}: ${f.rule}`).join('\n'),
    );
    this.name = 'ExportLintError';
    this.findings = findings;
  }
}

// ─── Status ─────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, SiteStatus> = {
  active: 'active',
  in_progress: 'active',
  completed: 'shipped',
  validated: 'shipped',
  blocked: 'paused',
  draft: 'paused',
  pending: 'paused',
};

/** Brain status → card status; `null` means "not exported" (archived, cancelled, superseded, unknown). */
export function mapStatus(status: string): SiteStatus | null {
  return STATUS_MAP[status] ?? null;
}

// ─── Titles and slugs ───────────────────────────────────────────────────────

const PROJECT_PREFIX = /^\s*project\s*:\s*/i;

export function displayTitle(title: string): string {
  return title.replace(PROJECT_PREFIX, '').trim();
}

export function slugify(title: string): string {
  const slug = displayTitle(title)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'untitled';
}

// ─── Body parsing ───────────────────────────────────────────────────────────

const HEADING = /^#{1,6}\s/;
const SECTION_END = /^#{1,2}\s/;
const LINKS_HEADING = /^##\s+links\s*$/i;
const LINK_ITEM = /^\s*[-*+]\s+\[([^\]]+)\]\(([^)\s]+)\)\s*$/;
const NOT_PARAGRAPH = /^(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|```|~~~|\||!\[|<)/;

function stripInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strips a leading `# H1` (Brain entries often repeat their title) and leading blank lines. */
function dropLeadingTitle(lines: string[]): string[] {
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && /^#\s/.test(lines[i])) i++;
  return lines.slice(i);
}

const tidy = (lines: string[]) => lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

/** first paragraph → summary, `## Links` list → links (http(s) only), everything else → body. */
export function parseBody(content: string): { summary: string; links: Link[]; body: string } {
  const lines = dropLeadingTitle(content.replace(/\r\n?/g, '\n').split('\n'));
  const links: Link[] = [];
  const keep: string[] = [];

  // Pass 1: lift out the `## Links` section.
  for (let i = 0; i < lines.length; i++) {
    if (!LINKS_HEADING.test(lines[i])) {
      keep.push(lines[i]);
      continue;
    }
    let j = i + 1;
    for (; j < lines.length && !SECTION_END.test(lines[j]); j++) {
      const m = lines[j].match(LINK_ITEM);
      if (m && /^https?:\/\//i.test(m[2])) links.push({ label: m[1].trim(), url: m[2] });
    }
    i = j - 1;
  }

  // Pass 2: the first plain paragraph (outside code fences) becomes the summary.
  let start = -1;
  let end = -1;
  let inFence = false;
  for (let i = 0; i < keep.length; i++) {
    const line = keep[i];
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence || line.trim() === '' || NOT_PARAGRAPH.test(line) || HEADING.test(line)) continue;
    if (i > 0 && keep[i - 1].trim() !== '' && !HEADING.test(keep[i - 1])) continue; // mid-block
    start = i;
    end = i;
    while (end + 1 < keep.length && keep[end + 1].trim() !== '' && !HEADING.test(keep[end + 1])) end++;
    break;
  }
  const summary = start === -1 ? '' : stripInline(keep.slice(start, end + 1).join(' '));
  const body = start === -1 ? tidy(keep) : tidy([...keep.slice(0, start), ...keep.slice(end + 1)]);
  return { summary, links, body };
}

// ─── Safety lint ────────────────────────────────────────────────────────────

/** Rules beyond scripts/lib/scan.mjs (shared with verify:dist), specific to Brain content. */
const EXTRA_RULES: { rule: string; pattern: RegExp }[] = [
  {
    rule: 'cgnat-ipv4', // 100.64.0.0/10, the Tailscale range
    pattern: /(?<![\d.])100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}(?![\d]|\.\d)/g,
  },
  {
    rule: 'internal-host',
    pattern: /(?<![A-Za-z0-9-])(?:[a-z0-9-]+\.)+(?:local|lan|internal|localdomain|home\.arpa|corp)(?![A-Za-z0-9-])/gi,
  },
  { rule: 'token', pattern: /(?<![A-Za-z0-9])xox[abposr]-[A-Za-z0-9-]{10,}/g },
  {
    rule: 'secret-assignment', // a long hex/base64 value within ~20 chars after key/token/secret/password
    pattern:
      /(?<![A-Za-z])(?:api[_-]?key|access[_-]?key|key|token|secret|password|passwd|credential)s?(?![A-Za-z])[^\n]{0,20}?(?<![A-Za-z0-9+/_=-])(?:[A-Fa-f0-9]{33,}|[A-Za-z0-9+/_-]{33,}={0,2})(?![A-Za-z0-9+/_=-])/gi,
  },
];

const RULE_ORDER = [
  'private-ipv4',
  'cgnat-ipv4',
  'tailnet-host',
  'internal-host',
  'email',
  'token',
  'private-key',
  'secret-assignment',
];

/** Lints title + content. Returns one finding per (entry, rule); the matched text is deliberately dropped. */
export function lintEntry(entry: BrainEntry): Finding[] {
  const text = `${entry.title}\n${entry.content}`;
  const rules = new Set<string>(scanText(text).map((f) => f.rule));
  for (const { rule, pattern } of EXTRA_RULES) {
    if (new RegExp(pattern.source, pattern.flags).test(text)) rules.add(rule);
  }
  return [...rules]
    .sort((a, b) => RULE_ORDER.indexOf(a) - RULE_ORDER.indexOf(b))
    .map((rule) => ({ id: entry.id, rule }));
}

// ─── Brain API ──────────────────────────────────────────────────────────────

const apiBase = (baseUrl: string) => baseUrl.replace(/\/+$/, '') + '/api/v1';

async function brainGet(opts: FetchOptions, path: string): Promise<Response> {
  const res = await (opts.fetch ?? fetch)(apiBase(opts.baseUrl) + path, {
    headers: { authorization: `Bearer ${opts.token}`, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Brain API returned ${res.status} for ${path.split('?')[0]}`);
  return res;
}

/** Fetches every entry carrying ALL `tags`, paging until a short, non-truncated page. */
export async function fetchAllEntries(opts: FetchOptions, tags: string[]): Promise<BrainEntry[]> {
  const pageSize = opts.pageSize ?? 100;
  const maxPages = opts.maxPages ?? 50;
  const all: BrainEntry[] = [];
  for (let page = 0, offset = 0; page < maxPages; page++, offset += pageSize) {
    const qs = new URLSearchParams({
      tags: tags.join(','),
      limit: String(pageSize),
      offset: String(offset),
      sortBy: 'created',
      sortOrder: 'asc',
    });
    const data = (await (await brainGet(opts, `/entries?${qs}`)).json()) as {
      entries?: BrainEntry[];
      truncated?: boolean;
    };
    const entries = data.entries ?? [];
    all.push(...entries);
    if (entries.length < pageSize && !data.truncated) return all;
  }
  throw new Error(`Brain export: more than ${maxPages} pages for tags=${tags.join(',')}; refusing a partial export`);
}

// ─── Attachments ────────────────────────────────────────────────────────────

const IMAGE_REF =
  /!\[([^\]]*)\]\((?:attachment:([A-Za-z0-9_-]+)|https?:\/\/[^)\s]*\/api\/v1\/attachments\/([A-Za-z0-9_-]+)\/content([^)\s]*))\)/g;

const IMAGE_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
};

type AttachmentRef = { id: string; projectId: string };

function attachmentRefs(body: string, entry: BrainEntry): AttachmentRef[] {
  const refs: AttachmentRef[] = [];
  for (const m of body.matchAll(IMAGE_REF)) {
    const id = m[2] ?? m[3];
    const fromUrl = m[4] ? new URLSearchParams(m[4].replace(/^\?/, '')).get('project_id') : null;
    const projectId = fromUrl ?? entry.project_id;
    if (!projectId) throw new Error(`Brain export: entry ${entry.id} references attachment ${id} without a project`);
    refs.push({ id, projectId });
  }
  return refs;
}

async function downloadImage(opts: FetchOptions, ref: AttachmentRef): Promise<{ file: string; bytes: Uint8Array }> {
  const res = await brainGet(
    opts,
    `/attachments/${encodeURIComponent(ref.id)}/content?project_id=${encodeURIComponent(ref.projectId)}`,
  );
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const ext = IMAGE_EXT[type];
  if (!ext) throw new Error(`Brain export: attachment ${ref.id} is not an image (${type || 'unknown type'})`);
  return { file: `${ref.id}${ext}`, bytes: new Uint8Array(await res.arrayBuffer()) };
}

function rewriteImages(body: string, files: Map<string, string>, prefix: string): string {
  return body.replace(IMAGE_REF, (_all, alt: string, a?: string, b?: string) => {
    return `![${alt}](${prefix}${files.get((a ?? b) as string)})`;
  });
}

// ─── Rendering ──────────────────────────────────────────────────────────────

const q = (s: string) => JSON.stringify(s); // JSON strings are valid YAML double-quoted scalars

function isoDay(modified: string, id: string): string {
  const d = new Date(modified);
  if (Number.isNaN(d.getTime())) throw new Error(`Brain export: entry ${id} has an invalid modified date`);
  return d.toISOString().slice(0, 10);
}

const withBody = (frontmatter: string[], body: string) =>
  `---\n${frontmatter.join('\n')}\n---\n` + (body ? `\n${body}\n` : '');

function renderProject(entry: BrainEntry, status: SiteStatus, parsed: ReturnType<typeof parseBody>, body: string) {
  const links = parsed.links.length
    ? ['links:', ...parsed.links.flatMap((l) => [`  - label: ${q(l.label)}`, `    url: ${q(l.url)}`])]
    : ['links: []'];
  return withBody(
    [
      `title: ${q(displayTitle(entry.title))}`,
      `status: ${status}`,
      `summary: ${q(parsed.summary)}`,
      ...links,
      `updated: ${isoDay(entry.modified, entry.id)}`,
      `brainId: ${q(entry.id)}`,
    ],
    body,
  );
}

const nowBody = (entry: BrainEntry) => tidy(dropLeadingTitle(entry.content.replace(/\r\n?/g, '\n').split('\n')));

// ─── Orchestration ──────────────────────────────────────────────────────────

const byId = (a: BrainEntry, b: BrainEntry) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function uniqueById(entries: BrainEntry[]): BrainEntry[] {
  const seen = new Map<string, BrainEntry>();
  for (const e of entries) if (!seen.has(e.id)) seen.set(e.id, e);
  return [...seen.values()].sort(byId);
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isFile()).map((d) => d.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function sameContent(path: string, next: string | Uint8Array): Promise<boolean> {
  try {
    const cur = await readFile(path);
    return Buffer.compare(cur, typeof next === 'string' ? Buffer.from(next, 'utf8') : Buffer.from(next)) === 0;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

/** Fetch → lint (fail closed) → download referenced images → render → write changed files, delete stale ones. */
export async function runExport(opts: ExportOptions): Promise<ExportResult> {
  const projectEntries = uniqueById(await fetchAllEntries(opts, PROJECT_TAGS)).filter(
    (e) => mapStatus(e.status) !== null,
  );
  const nowEntry =
    uniqueById(await fetchAllEntries(opts, NOW_TAGS))
      .filter((e) => mapStatus(e.status) !== null)
      .sort((a, b) => Date.parse(b.modified) - Date.parse(a.modified) || byId(a, b))[0] ?? null;

  const findings = [...projectEntries, ...(nowEntry ? [nowEntry] : [])].flatMap(lintEntry);
  if (findings.length > 0) throw new ExportLintError(findings);

  // Slugs: in id order, first claim wins; later collisions get a stable `-<id>` suffix.
  const taken = new Set<string>();
  const cards = projectEntries.map((entry) => {
    let slug = slugify(entry.title);
    if (taken.has(slug)) slug = `${slug}-${slugify(entry.id)}`;
    taken.add(slug);
    return { entry, slug, parsed: parseBody(entry.content) };
  });
  const nowText = nowEntry ? nowBody(nowEntry) : '';

  const refs = new Map<string, AttachmentRef>();
  for (const c of cards) for (const r of attachmentRefs(c.parsed.body, c.entry)) refs.set(r.id, r);
  if (nowEntry) for (const r of attachmentRefs(nowText, nowEntry)) refs.set(r.id, r);
  const images = new Map<string, { file: string; bytes: Uint8Array }>();
  for (const id of [...refs.keys()].sort()) images.set(id, await downloadImage(opts, refs.get(id)!));
  const imageFiles = new Map([...images].map(([id, img]) => [id, img.file]));

  const planned = new Map<string, string | Uint8Array>();
  for (const { entry, slug, parsed } of cards) {
    const body = rewriteImages(parsed.body, imageFiles, '../../assets/brain/');
    planned.set(`${PROJECTS_DIR}/${slug}.md`, renderProject(entry, mapStatus(entry.status)!, parsed, body));
  }
  if (nowEntry) {
    const body = rewriteImages(nowText, imageFiles, '../assets/brain/');
    planned.set(NOW_FILE, withBody([`updated: ${isoDay(nowEntry.modified, nowEntry.id)}`], body));
  }
  for (const img of images.values()) planned.set(`${ASSETS_DIR}/${img.file}`, img.bytes);

  const stale = [
    ...(await listFiles(join(opts.root, PROJECTS_DIR))).filter((f) => f.endsWith('.md')).map((f) => `${PROJECTS_DIR}/${f}`),
    ...(await listFiles(join(opts.root, ASSETS_DIR))).map((f) => `${ASSETS_DIR}/${f}`),
  ]
    .filter((p) => !planned.has(p))
    .sort();

  const written: string[] = [];
  for (const rel of [...planned.keys()].sort()) {
    const abs = join(opts.root, rel);
    if (await sameContent(abs, planned.get(rel)!)) continue;
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, planned.get(rel)!);
    written.push(rel);
  }
  for (const rel of stale) await rm(join(opts.root, rel));

  return { written, deleted: stale, projects: cards.length, now: nowEntry !== null };
}
