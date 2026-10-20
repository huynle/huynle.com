/** Small, framework-free helpers shared by pages. Kept pure so they can be unit tested. */

/** Drafts are visible in `astro dev` but never in a production build. */
export function isPublished(entry: { data: { draft: boolean } }, prod: boolean): boolean {
  return !(prod && entry.data.draft);
}

/** Newest first; ties broken by id so output is deterministic. */
export function byDateDesc(
  a: { id: string; data: { date: Date } },
  b: { id: string; data: { date: Date } },
): number {
  const diff = b.data.date.getTime() - a.data.date.getTime();
  return diff !== 0 ? diff : a.id.localeCompare(b.id);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "20 Oct 2026", always in UTC so builds don't depend on the machine's time zone. */
export function formatDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "2026-10-20" in UTC, for `<time datetime>`. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const WORDS_PER_MINUTE = 220;

/** Estimated minutes to read a markdown body (code fences excluded), minimum 1. */
export function readingTime(markdown: string): number {
  const prose = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`[\]()!-]/g, ' ');
  const words = prose.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}
