import { describe, expect, it } from 'vitest';
import { draftSlugs, scanPath, scanText } from '../scripts/lib/scan.mjs';

const rules = (text, opts) => scanText(text, opts).map((f) => f.rule);

describe('scanText', () => {
  it('passes clean public HTML', () => {
    const html =
      '<a href="https://github.com/huynle">GitHub</a> <p>Version 1.2.3, 10 items, @font-face, user@2x.png</p>';
    expect(scanText(html)).toEqual([]);
  });

  it.each([
    ['10.0.12.4', 'private-ipv4'],
    ['host 172.16.0.1 up', 'private-ipv4'],
    ['172.31.255.254', 'private-ipv4'],
    ['192.168.1.20', 'private-ipv4'],
  ])('flags private IPv4 %s', (text, rule) => {
    expect(rules(text)).toContain(rule);
  });

  it('does not flag public or out-of-range addresses', () => {
    expect(rules('8.8.8.8 172.32.0.1 172.15.0.1 1.10.0.0.1')).toEqual([]);
  });

  it('flags tailnet hostnames', () => {
    expect(rules('ssh amos.tail1234.ts.net')).toContain('tailnet-host');
  });

  it('flags email addresses', () => {
    expect(rules('mail me: someone@example.com')).toContain('email');
  });

  it.each([
    ['ghp_' + 'a'.repeat(36), 'token'],
    ['gho_' + 'B'.repeat(36), 'token'],
    ['github_pat_' + 'c'.repeat(40), 'token'],
    ['sk-' + 'd'.repeat(32), 'token'],
    ['AKIA' + 'ABCDEFGHIJKLMNOP', 'token'],
    ['-----BEGIN PRIVATE KEY-----', 'private-key'],
  ])('flags secret-looking string %s', (text, rule) => {
    expect(rules(text)).toContain(rule);
  });

  it('does not treat words ending in "sk-" as keys', () => {
    expect(rules('class="task-list-item-checkbox-container-wrapper"')).toEqual([]);
  });

  it('flags a draft slug as a whole word only', () => {
    expect(rules('<a href="/posts/secret-plan/">', { draftSlugs: ['secret-plan'] })).toContain('draft-slug');
    expect(rules('<a href="/posts/secret-plan-v2/">', { draftSlugs: ['secret-plan'] })).toEqual([]);
  });
});

describe('scanPath', () => {
  it('flags output files whose path contains a draft slug', () => {
    expect(scanPath('posts/secret-plan/index.html', ['secret-plan']).map((f) => f.rule)).toEqual(['draft-slug']);
    expect(scanPath('posts/hello/index.html', ['secret-plan'])).toEqual([]);
  });
});

describe('draftSlugs', () => {
  it('returns slugs of sources whose frontmatter sets draft: true', () => {
    const sources = [
      { path: 'src/content/posts/a.md', content: '---\ntitle: A\ndraft: true\n---\nbody' },
      { path: 'src/content/posts/b.mdx', content: '---\ntitle: B\ndraft: false\n---\ndraft: true' },
      { path: 'src/content/posts/c.md', content: '---\ntitle: C\n---\n' },
      { path: 'src/content/posts/nested/d.md', content: "---\ndraft:   true # wip\n---\n" },
    ];
    expect(draftSlugs(sources)).toEqual(['a', 'nested/d']);
  });
});
