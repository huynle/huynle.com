import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** Articles written in this repo. `draft: true` keeps a post out of production builds. */
const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.{md,mdx}' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      summary: z.string(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
      cover: image().optional(),
    }),
});

/** GENERATED from Brain by scripts/brain-export.ts. Do not edit by hand. */
const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '*.md' }),
  schema: z.object({
    title: z.string(),
    status: z.enum(['active', 'paused', 'shipped']),
    summary: z.string(),
    links: z.array(z.object({ label: z.string(), url: z.url() })).default([]),
    updated: z.coerce.date(),
    /** Traces the card back to its Brain entry. Never rendered. */
    brainId: z.string(),
  }),
});

/** GENERATED from Brain: the single Now snapshot in src/content/now.md. */
const now = defineCollection({
  loader: glob({ base: './src/content', pattern: 'now.md' }),
  schema: z.object({
    updated: z.coerce.date(),
  }),
});

export const collections = { posts, projects, now };
