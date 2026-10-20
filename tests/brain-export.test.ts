import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ExportLintError,
  fetchAllEntries,
  lintEntry,
  mapStatus,
  parseBody,
  runExport,
  slugify,
  type BrainEntry,
} from '../scripts/lib/brain-export.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures/brain');
const fixture = async (name: string) => JSON.parse(await readFile(join(FIXTURES, name), 'utf8'));
const expected = (name: string) => readFile(join(FIXTURES, 'expected', name), 'utf8');

const BASE = 'https://brain.example.test';
const TOKEN = 'test-token-not-a-secret';

/** Secret-shaped strings are built at runtime so no scanner-bait literal lives in git. */
const PLACEHOLDERS: Record<string, string> = {
  GHP: 'ghp_' + 'A1b2C3d4'.repeat(5),
  SK: 'sk-' + 'x9Y8z7W6'.repeat(4),
  AKIA: 'AKIA' + 'QWERTYUIOPASDFGH',
  XOXB: 'xoxb-' + '1234567890-abcdefghij',
  PEM: '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----',
  HEX40: 'deadbeef'.repeat(5),
  B64: 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo0NTY3ODkw',
};
const expand = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => PLACEHOLDERS[k] ?? '');

type Route = (url: URL) => { status?: number; json?: unknown; body?: Uint8Array<ArrayBuffer>; type?: string } | undefined;

/** A fetch stand-in serving recorded Brain responses; records every request. */
function fakeFetch(route: Route) {
  const calls: { url: URL; auth: string | null }[] = [];
  const fn = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push({ url, auth: headers.get('authorization') });
    const r = route(url);
    if (!r) return new Response('not found', { status: 404 });
    if (r.body) return new Response(r.body, { status: r.status ?? 200, headers: { 'content-type': r.type ?? '' } });
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  };
  return { fn: fn as typeof fetch, calls };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 4, 5, 6]);

/** Routes the standard fixture set: 3 project pages (page size 2), 2 Now entries, 2 image attachments. */
async function standardRoutes(overrides: { projects?: BrainEntry[][]; now?: BrainEntry[] } = {}) {
  const pages = overrides.projects ?? [
    (await fixture('projects-page-1.json')).entries,
    (await fixture('projects-page-2.json')).entries,
    (await fixture('projects-page-3.json')).entries,
  ];
  const now = overrides.now ?? (await fixture('now.json')).entries;
  return fakeFetch((url) => {
    if (url.pathname === '/api/v1/entries') {
      const tags = url.searchParams.get('tags');
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 100);
      if (tags === 'public,site-project') {
        const page = pages[offset / limit] ?? [];
        return { json: { entries: page, total: page.length, limit, offset } };
      }
      if (tags === 'public,site-now') {
        const page = offset === 0 ? now : [];
        return { json: { entries: page, total: page.length, limit, offset } };
      }
    }
    if (url.pathname === '/api/v1/attachments/att00001/content' && url.searchParams.get('project_id') === 'hardware') {
      return { body: PNG, type: 'image/png' };
    }
    if (url.pathname === '/api/v1/attachments/att00002/content' && url.searchParams.get('project_id') === 'hardware') {
      return { body: JPG, type: 'image/jpeg; charset=binary' };
    }
    return undefined;
  });
}

describe('mapStatus', () => {
  it.each([
    ['active', 'active'],
    ['in_progress', 'active'],
    ['completed', 'shipped'],
    ['validated', 'shipped'],
    ['blocked', 'paused'],
    ['draft', 'paused'],
    ['pending', 'paused'],
    ['archived', null],
    ['cancelled', null],
    ['superseded', null],
    ['something-new', null],
  ])('%s -> %s', (brain, site) => {
    expect(mapStatus(brain)).toBe(site);
  });
});

describe('slugify', () => {
  it('strips a leading "Project:" and kebab-cases', () => {
    expect(slugify('Project: Bench Scope')).toBe('bench-scope');
    expect(slugify('project:   Bench   Scope ')).toBe('bench-scope');
  });

  it('drops punctuation and accents and is stable', () => {
    expect(slugify('Café Racer v2.0 (Rev B)!')).toBe('cafe-racer-v2-0-rev-b');
    expect(slugify('Café Racer v2.0 (Rev B)!')).toBe(slugify('Café Racer v2.0 (Rev B)!'));
  });

  it('never returns an empty slug', () => {
    expect(slugify('Project: !!!')).toBe('untitled');
  });
});

describe('parseBody', () => {
  it('splits summary, links and body', async () => {
    const [bench] = (await fixture('projects-page-1.json')).entries;
    const parsed = parseBody(bench.content);
    expect(parsed.summary).toBe('A tiny oscilloscope front-end for the bench.');
    expect(parsed.links).toEqual([
      { label: 'Source', url: 'https://github.com/huynle/bench-scope' },
      { label: 'Write-up', url: 'https://huynle.com/posts/bench-scope/' },
    ]);
    expect(parsed.body).toBe('More detail paragraph.\n\n## Notes\n\nTrailing section.');
  });

  it('accepts * bullets and stops the Links section at the next heading', () => {
    const parsed = parseBody('Intro.\n\n## Links\n* [A](https://a.example)\n\n## Next\n\n- [B](https://b.example)\n');
    expect(parsed.links).toEqual([{ label: 'A', url: 'https://a.example' }]);
    expect(parsed.body).toBe('## Next\n\n- [B](https://b.example)');
  });

  it('strips inline markdown from the summary', () => {
    expect(parseBody('Uses **bold**, `code` and [a link](https://x.example).').summary).toBe(
      'Uses bold, code and a link.',
    );
  });

  it('handles content with no paragraph', () => {
    expect(parseBody('')).toEqual({ summary: '', links: [], body: '' });
    expect(parseBody('## Links\n\n- [A](https://a.example)\n')).toEqual({
      summary: '',
      links: [{ label: 'A', url: 'https://a.example' }],
      body: '',
    });
  });
});

describe('lintEntry', () => {
  it('passes a clean public entry', async () => {
    const [bench] = (await fixture('projects-page-1.json')).entries;
    expect(lintEntry(bench)).toEqual([]);
  });

  it('does not flag ordinary text that resembles the patterns', () => {
    const entry = {
      id: 'clean001',
      title: 'Project: Clean',
      status: 'active',
      content:
        'Version 1.2.3 at 8.8.8.8 and 172.32.0.1, logo@2x.png, localhost:4321, task-list, the token budget was fine.\n' +
        'Commit https://github.com/huynle/x/commit/' + 'abcdef12'.repeat(5) + '\n',
      modified: '2026-10-01T00:00:00Z',
      tags: [],
    } as BrainEntry;
    expect(lintEntry(entry)).toEqual([]);
  });

  it('checks the title too', () => {
    const entry = { id: 't1', title: 'Project: nas.local', content: 'ok', status: 'active', modified: '', tags: [] };
    expect(lintEntry(entry as BrainEntry)).toEqual([{ id: 't1', rule: 'internal-host' }]);
  });

  it.each([
    'private-ipv4',
    'cgnat-ipv4',
    'tailnet-host',
    'internal-host',
    'email',
    'token',
    'private-key',
    'secret-assignment',
  ])('rule %s rejects its seeded entries', async (rule) => {
    const leaks: { rule: string; entry: BrainEntry }[] = await fixture('leaks.json');
    const seeded = leaks.filter((l) => l.rule === rule);
    expect(seeded.length).toBeGreaterThan(0);
    for (const { entry } of seeded) {
      const findings = lintEntry({ ...entry, content: expand(entry.content) });
      expect(findings).toContainEqual({ id: entry.id, rule });
    }
  });
});

describe('fetchAllEntries', () => {
  it('pages through results with the bearer token until a short page', async () => {
    const { fn, calls } = await standardRoutes();
    const entries = await fetchAllEntries({ baseUrl: BASE, token: TOKEN, fetch: fn, pageSize: 2 }, [
      'public',
      'site-project',
    ]);
    expect(entries.map((e) => e.id)).toEqual(['a1b2c3d4', 'e5f6g7h8', 'i9j0k1l2', 'm3n4o5p6', 'q7r8s9t0']);
    expect(calls.map((c) => c.url.searchParams.get('offset'))).toEqual(['0', '2', '4']);
    expect(calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
    expect(calls[0].url.searchParams.get('tags')).toBe('public,site-project');
  });

  it('keeps paging past a short page when the server reports truncated', async () => {
    const pages = [
      { entries: [{ id: 'a' }], truncated: true },
      { entries: [{ id: 'b' }] },
    ];
    const { fn, calls } = fakeFetch((url) => {
      const i = Number(url.searchParams.get('offset')) / 2;
      return { json: { ...pages[i], limit: 2, offset: i * 2, total: pages[i].entries.length } };
    });
    const entries = await fetchAllEntries({ baseUrl: BASE, token: TOKEN, fetch: fn, pageSize: 2 }, ['public']);
    expect(entries.map((e) => e.id)).toEqual(['a', 'b']);
    expect(calls).toHaveLength(2);
  });

  it('fails on a non-2xx response instead of exporting a partial set', async () => {
    const { fn } = fakeFetch(() => ({ status: 401, json: { error: 'Unauthorized' } }));
    await expect(fetchAllEntries({ baseUrl: BASE, token: TOKEN, fetch: fn }, ['public'])).rejects.toThrow(/401/);
  });

  it('gives up after maxPages rather than looping forever', async () => {
    const { fn } = fakeFetch((url) => ({
      json: { entries: [{ id: url.searchParams.get('offset') }], truncated: true, limit: 1 },
    }));
    await expect(
      fetchAllEntries({ baseUrl: BASE, token: TOKEN, fetch: fn, pageSize: 1, maxPages: 5 }, ['public']),
    ).rejects.toThrow(/pages/);
  });
});

describe('runExport', () => {
  let root: string;
  const projectsDir = () => join(root, 'src/content/projects');
  const read = (rel: string) => readFile(join(root, rel), 'utf8');

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'brain-export-'));
    await mkdir(projectsDir(), { recursive: true });
    await writeFile(join(projectsDir(), 'sample-site-rebuild.md'), '---\nbrainId: sample-site-rebuild\n---\n');
    await writeFile(join(root, 'src/content/now.md'), '---\nupdated: 2026-01-01\n---\n\nPlaceholder.\n');
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes project cards, Now and images matching the golden files', async () => {
    const { fn } = await standardRoutes();
    const result = await runExport({ root, baseUrl: BASE, token: TOKEN, fetch: fn, pageSize: 2 });

    expect((await readdir(projectsDir())).sort()).toEqual(['bench-scope.md', 'paused-gadget.md', 'shipped-widget.md']);
    for (const f of ['bench-scope.md', 'paused-gadget.md', 'shipped-widget.md']) {
      expect(await read(`src/content/projects/${f}`)).toBe(await expected(f));
    }
    expect(await read('src/content/now.md')).toBe(await expected('now.md'));
    expect(new Uint8Array(await readFile(join(root, 'src/assets/brain/att00001.png')))).toEqual(PNG);
    expect(new Uint8Array(await readFile(join(root, 'src/assets/brain/att00002.jpg')))).toEqual(JPG);
    expect(result.deleted).toEqual(['src/content/projects/sample-site-rebuild.md']);
  });

  it('is deterministic: input order does not matter and a rerun changes nothing', async () => {
    const p1 = (await fixture('projects-page-1.json')).entries;
    const p2 = (await fixture('projects-page-2.json')).entries;
    const p3 = (await fixture('projects-page-3.json')).entries;
    const first = await standardRoutes();
    await runExport({ root, baseUrl: BASE, token: TOKEN, fetch: first.fn, pageSize: 2 });
    const snapshot = await Promise.all(
      ['bench-scope.md', 'paused-gadget.md', 'shipped-widget.md'].map((f) => read(`src/content/projects/${f}`)),
    );

    const shuffled = await standardRoutes({ projects: [[...p3, p2[1]], [p2[0], p1[1]], [p1[0]]] });
    const result = await runExport({ root, baseUrl: BASE, token: TOKEN, fetch: shuffled.fn, pageSize: 2 });
    const again = await Promise.all(
      ['bench-scope.md', 'paused-gadget.md', 'shipped-widget.md'].map((f) => read(`src/content/projects/${f}`)),
    );
    expect(again).toEqual(snapshot);
    expect(result.written).toEqual([]);
    expect(result.deleted).toEqual([]);
  });

  it('deletes cards and images whose entry is no longer exported', async () => {
    await runExport({ root, baseUrl: BASE, token: TOKEN, fetch: (await standardRoutes()).fn, pageSize: 2 });
    const [bench] = (await fixture('projects-page-1.json')).entries;
    const { fn } = await standardRoutes({ projects: [[bench]] });
    const result = await runExport({ root, baseUrl: BASE, token: TOKEN, fetch: fn, pageSize: 2 });
    expect(await readdir(projectsDir())).toEqual(['bench-scope.md']);
    expect(result.deleted).toEqual([
      'src/assets/brain/att00001.png',
      'src/assets/brain/att00002.jpg',
      'src/content/projects/paused-gadget.md',
      'src/content/projects/shipped-widget.md',
    ]);
    expect(existsSync(join(root, 'src/assets/brain/att00001.png'))).toBe(false);
  });

  it('gives colliding slugs a stable id suffix', async () => {
    const [bench] = (await fixture('projects-page-1.json')).entries;
    const twin = { ...bench, id: 'zz999999', title: 'Bench Scope' };
    const { fn } = await standardRoutes({ projects: [[twin, bench]] });
    await runExport({ root, baseUrl: BASE, token: TOKEN, fetch: fn, pageSize: 2 });
    expect((await readdir(projectsDir())).sort()).toEqual(['bench-scope-zz999999.md', 'bench-scope.md']);
    expect(await read('src/content/projects/bench-scope.md')).toContain('brainId: "a1b2c3d4"');
  });

  it('leaves now.md untouched when there is no site-now entry', async () => {
    const before = await read('src/content/now.md');
    const { fn } = await standardRoutes({ now: [] });
    await runExport({ root, baseUrl: BASE, token: TOKEN, fetch: fn, pageSize: 2 });
    expect(await read('src/content/now.md')).toBe(before);
  });

  it('fails closed: a leaking entry aborts before any file is written or deleted', async () => {
    const leaks: { rule: string; entry: BrainEntry }[] = await fixture('leaks.json');
    const ghp = leaks.find((l) => l.entry.content.includes('{{GHP}}'))!.entry;
    const bad = { ...ghp, content: expand(ghp.content) };
    const badNow = { ...(await fixture('now.json')).entries[1], id: 'nowleak1', content: 'Ping me at 10.1.2.3\n' };
    const [bench] = (await fixture('projects-page-1.json')).entries;
    const { fn, calls } = await standardRoutes({ projects: [[bench, bad]], now: [badNow] });

    const err = await runExport({ root, baseUrl: BASE, token: TOKEN, fetch: fn, pageSize: 2 }).catch((e) => e);
    expect(err).toBeInstanceOf(ExportLintError);
    expect(err.findings).toEqual([
      { id: ghp.id, rule: 'token' },
      { id: 'nowleak1', rule: 'private-ipv4' },
    ]);
    expect(err.message).toContain(ghp.id);
    expect(err.message).not.toContain(PLACEHOLDERS.GHP);
    expect(err.message).not.toContain('10.1.2.3');
    expect(await readdir(projectsDir())).toEqual(['sample-site-rebuild.md']);
    expect(await read('src/content/now.md')).toContain('Placeholder.');
    expect(calls.some((c) => c.url.pathname.includes('/attachments/'))).toBe(false);
  });

  it('ignores leaks in entries that are not exported (archived)', async () => {
    const dead = { id: 'dead0001', title: 'Project: Dead', status: 'archived', content: 'at 10.0.0.1', modified: '2026-01-01T00:00:00Z', tags: [], project_id: 'x' };
    const { fn } = await standardRoutes({ projects: [[dead as BrainEntry]], now: [] });
    await expect(runExport({ root, baseUrl: BASE, token: TOKEN, fetch: fn, pageSize: 2 })).resolves.toBeDefined();
  });

  it('rejects a referenced attachment that is not an image', async () => {
    const entry = { id: 'att0bad1', title: 'Project: Doc', status: 'active', content: 'S.\n\n![x](attachment:pdf00001)\n', modified: '2026-10-01T00:00:00Z', tags: [], project_id: 'p' };
    const routes = await standardRoutes({ projects: [[entry as BrainEntry]], now: [] });
    const fn = (async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes('/attachments/pdf00001/content')) {
        return new Response('pdf', { headers: { 'content-type': 'application/pdf' } });
      }
      return routes.fn(input, init);
    }) as typeof fetch;
    await expect(runExport({ root, baseUrl: BASE, token: TOKEN, fetch: fn, pageSize: 2 })).rejects.toThrow(/image/);
    expect(await readdir(projectsDir())).toEqual(['sample-site-rebuild.md']);
  });
});
