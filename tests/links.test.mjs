import { describe, expect, it } from 'vitest';
import { checkLinks, extractLinks, resolveTarget } from '../scripts/lib/links.mjs';

describe('extractLinks', () => {
  it('collects href and src attribute values', () => {
    const html = `<a href="/posts/">x</a><link rel="stylesheet" href='/_astro/a.css'><img src="/img/a.png" alt="">`;
    expect(extractLinks(html)).toEqual(['/posts/', '/_astro/a.css', '/img/a.png']);
  });

  it('decodes &amp; in attribute values', () => {
    expect(extractLinks('<a href="/a/?x=1&amp;y=2">')).toEqual(['/a/?x=1&y=2']);
  });
});

describe('resolveTarget', () => {
  const site = 'https://huynle.com';

  it.each(['https://github.com/huynle', 'mailto:x', 'data:image/png;base64,AA', '//cdn.example', '#top', 'javascript:void(0)'])(
    'ignores external and non-navigational link %s',
    (link) => {
      expect(resolveTarget(link, 'index.html', site)).toBeNull();
    },
  );

  it('resolves root-relative links and strips query and hash', () => {
    expect(resolveTarget('/posts/hello/?a=1#h', 'index.html', site)).toBe('posts/hello/');
  });

  it('resolves page-relative links against the source page', () => {
    expect(resolveTarget('../about/', 'posts/index.html', site)).toBe('about/');
    expect(resolveTarget('img.png', 'posts/hello/index.html', site)).toBe('posts/hello/img.png');
  });

  it('treats absolute links to the site itself as internal', () => {
    expect(resolveTarget('https://huynle.com/rss.xml', 'index.html', site)).toBe('rss.xml');
  });
});

describe('checkLinks', () => {
  const files = new Set(['index.html', 'posts/index.html', 'posts/hello/index.html', 'rss.xml', '404.html']);
  const exists = (p) => files.has(p);

  it('accepts links to directories with index.html and to files', () => {
    const pages = [{ rel: 'index.html', html: '<a href="/posts/">p</a><a href="/posts/hello">h</a><a href="/rss.xml">r</a><a href="/">home</a>' }];
    expect(checkLinks(pages, exists, 'https://huynle.com')).toEqual([]);
  });

  it('reports broken internal links with their source page', () => {
    const pages = [{ rel: 'posts/index.html', html: '<a href="/posts/missing/">m</a><a href="https://x.dev/">ok</a>' }];
    expect(checkLinks(pages, exists, 'https://huynle.com')).toEqual([{ from: 'posts/index.html', link: '/posts/missing/' }]);
  });
});
