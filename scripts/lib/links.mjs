/**
 * Offline internal link checking for dist/: every same-site href/src must resolve to a built file.
 * External links are ignored (no network in CI).
 */
import { posix } from 'node:path';

const ATTR = /\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** @param {string} html */
export function extractLinks(html) {
  return [...html.matchAll(ATTR)].map((m) => (m[1] ?? m[2]).replaceAll('&amp;', '&').trim());
}

/**
 * Map a link found on `fromRel` to a dist-relative target path, or null when it is not an internal link.
 * @param {string} link
 * @param {string} fromRel dist-relative path of the page containing the link
 * @param {string} site canonical origin, e.g. https://huynle.com
 */
export function resolveTarget(link, fromRel, site) {
  if (link === '' || link.startsWith('#') || link.startsWith('//')) return null;
  const origin = new URL(site).origin;
  const base = new URL(`/${fromRel}`, origin);
  let url;
  try {
    url = new URL(link, base);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null; // other hosts and mailto:, data:, javascript: (origin "null")
  return decodeURIComponent(url.pathname).replace(/^\//, '');
}

/** Files that would satisfy a request for `target` under nginx `try_files $uri $uri/index.html $uri.html`. */
function candidates(target) {
  if (target === '' || target.endsWith('/')) return [`${target}index.html`];
  return [target, `${target}/index.html`, `${target}.html`];
}

/**
 * @param {{ rel: string, html: string }[]} pages
 * @param {(relPath: string) => boolean} exists
 * @param {string} site
 * @returns {{ from: string, link: string }[]}
 */
export function checkLinks(pages, exists, site) {
  const broken = [];
  for (const { rel, html } of pages) {
    for (const link of extractLinks(html)) {
      const target = resolveTarget(link, rel, site);
      if (target === null) continue;
      if (!candidates(posix.normalize(target).replace(/^\.\/?$/, '')).some(exists)) broken.push({ from: rel, link });
    }
  }
  return broken;
}
