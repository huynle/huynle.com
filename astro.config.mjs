// @ts-check
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://huynle.com',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  integrations: [mdx(), sitemap({ filter: (page) => !page.endsWith('/404/') })],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark-dimmed' },
      defaultColor: false,
    },
  },
});
