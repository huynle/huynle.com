import { describe, expect, it } from 'vitest';
import { byDateDesc, formatDate, isoDate, isPublished, readingTime } from '../src/lib/content';

describe('isPublished', () => {
  it('keeps drafts out of production builds', () => {
    expect(isPublished({ data: { draft: true } }, true)).toBe(false);
    expect(isPublished({ data: { draft: false } }, true)).toBe(true);
  });

  it('shows drafts in development', () => {
    expect(isPublished({ data: { draft: true } }, false)).toBe(true);
  });
});

describe('byDateDesc', () => {
  it('sorts newest first', () => {
    const items = [
      { id: 'a', data: { date: new Date('2026-01-01') } },
      { id: 'c', data: { date: new Date('2026-03-01') } },
      { id: 'b', data: { date: new Date('2026-02-01') } },
    ];
    expect([...items].sort(byDateDesc).map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('breaks ties by id so output is deterministic', () => {
    const d = new Date('2026-01-01');
    const items = [
      { id: 'b', data: { date: d } },
      { id: 'a', data: { date: d } },
    ];
    expect([...items].sort(byDateDesc).map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('formatDate', () => {
  it('formats in UTC so builds do not depend on the machine time zone', () => {
    expect(formatDate(new Date('2026-10-20T00:00:00Z'))).toBe('20 Oct 2026');
    expect(formatDate(new Date('2026-01-05T23:30:00Z'))).toBe('05 Jan 2026');
  });
});

describe('isoDate', () => {
  it('returns YYYY-MM-DD in UTC', () => {
    expect(isoDate(new Date('2026-10-20T23:59:00Z'))).toBe('2026-10-20');
  });
});

describe('readingTime', () => {
  it('is at least one minute', () => {
    expect(readingTime('')).toBe(1);
    expect(readingTime('a few words')).toBe(1);
  });

  it('uses about 220 words per minute and ignores code fences and markup', () => {
    const words = Array.from({ length: 660 }, () => 'word').join(' ');
    const code = '```sh\n' + Array.from({ length: 500 }, () => 'x').join(' ') + '\n```';
    expect(readingTime(`# Title\n\n${words}\n\n${code}`)).toBe(3);
  });
});
