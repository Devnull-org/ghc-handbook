/**
 * The site is served from a sub-path on GitHub Pages, so every internal URL is
 * built here. Astro's BASE_URL already carries the configured base.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function withBase(path: string): string {
  if (!path.startsWith('/')) return `${BASE}/${path}`;
  return `${BASE}${path}`;
}

export function noteHref(id: string): string {
  return withBase(`/notes/${encodeURIComponent(id)}/`);
}

export function chapterHref(slug: string): string {
  return withBase(`/handbook/${slug}/`);
}
