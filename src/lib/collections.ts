import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { byDateDesc, byProjectOrder, isPublished } from './content';

/** Published posts, newest first. Drafts only appear in `astro dev`. */
export async function getPosts(): Promise<CollectionEntry<'posts'>[]> {
  const posts = await getCollection('posts', (p) => isPublished(p, import.meta.env.PROD));
  return posts.sort(byDateDesc);
}

export async function getProjects(): Promise<CollectionEntry<'projects'>[]> {
  return (await getCollection('projects')).sort(byProjectOrder);
}

export async function getNow(): Promise<CollectionEntry<'now'>> {
  const now = await getEntry('now', 'now');
  if (!now) throw new Error('src/content/now.md is missing');
  return now;
}
