/**
 * Fail-closed checks for the built site: nothing private, secret, or unpublished may reach dist/.
 * Pure functions; scripts/verify-dist.mjs does the file walking.
 */

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const NOT_BEFORE = '(?<![\\d.])';
const NOT_AFTER = '(?![\\d]|\\.\\d)';

/** @type {{ rule: string, pattern: RegExp }[]} */
const RULES = [
  {
    rule: 'private-ipv4',
    pattern: new RegExp(
      `${NOT_BEFORE}(?:10\\.${OCTET}|172\\.(?:1[6-9]|2\\d|3[01])|192\\.168)\\.${OCTET}\\.${OCTET}${NOT_AFTER}`,
      'g',
    ),
  },
  { rule: 'tailnet-host', pattern: /[a-z0-9-]+\.ts\.net\b/gi },
  {
    rule: 'email',
    // Skips asset names like "logo@2x.png" by refusing file-extension "TLDs".
    pattern:
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?!(?:png|jpe?g|gif|webp|avif|svg|css|js|mjs|woff2?)\b)[A-Za-z]{2,}\b/g,
  },
  {
    rule: 'token',
    pattern:
      /(?<![A-Za-z0-9])(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,}|sk-(?:[A-Za-z]+-)?[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})/g,
  },
  { rule: 'private-key', pattern: /-----BEGIN [A-Z0-9 ]*-----/g },
];

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wholeWord = (slug) => new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(slug)}(?![A-Za-z0-9_-])`, 'g');

/**
 * @param {string} text
 * @param {{ draftSlugs?: string[] }} [options]
 * @returns {{ rule: string, match: string }[]}
 */
export function scanText(text, { draftSlugs: slugs = [] } = {}) {
  const findings = [];
  for (const { rule, pattern } of RULES) {
    for (const m of text.matchAll(pattern)) findings.push({ rule, match: m[0] });
  }
  for (const slug of slugs) {
    for (const m of text.matchAll(wholeWord(slug))) findings.push({ rule: 'draft-slug', match: m[0] });
  }
  return findings;
}

/**
 * @param {string} relPath path of an output file relative to dist/
 * @param {string[]} slugs
 */
export function scanPath(relPath, slugs) {
  return slugs.filter((slug) => wholeWord(slug).test(relPath)).map((slug) => ({ rule: 'draft-slug', match: slug }));
}

/**
 * Slugs (path under the posts dir, without extension) of sources whose frontmatter sets `draft: true`.
 * @param {{ path: string, content: string }[]} sources
 */
export function draftSlugs(sources) {
  return sources
    .filter(({ content }) => {
      const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      return fm !== null && /^draft:\s*true\b/m.test(fm[1]);
    })
    .map(({ path }) => path.replace(/^.*?src\/content\/posts\//, '').replace(/\.mdx?$/, ''))
    .sort();
}
