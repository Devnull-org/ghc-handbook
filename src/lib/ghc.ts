/**
 * Build-time access to the pinned GHC data.
 *
 * Everything version-specific derives from ghc-pin.json, so re-pinning the
 * handbook to a new GHC release is one edit plus `npm run regen`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

export interface Pin {
  tag: string;
  ghcVersion: string;
  canonical: { host: string; blobUrl: string; issueUrl: string };
  mirror: { host: string; cloneUrl: string; blobUrl: string };
  sourceRoots: string[];
  referenceRoots: string[];
  checkoutDir: string;
}

export interface Backlink {
  id: string | null;
  module: string | null;
  file: string;
  line: number;
}

export interface Note {
  id: string;
  title: string;
  module: string | null;
  file: string;
  line: number;
  body: string;
  tickets: string[];
  area: 'compiler' | 'rts' | 'libraries';
  refsOut: string[];
  refsIn: Backlink[];
}

export interface NotesPayload {
  generatedFrom: { tag: string; ghcVersion: string };
  stats: Record<string, number>;
  notes: Note[];
}

export const pin: Pin = JSON.parse(readFileSync(join(ROOT, 'ghc-pin.json'), 'utf8'));

let cache: NotesPayload | null = null;

export function loadNotes(): NotesPayload {
  if (!cache) {
    cache = JSON.parse(readFileSync(join(ROOT, 'data', 'notes.json'), 'utf8'));
  }
  return cache!;
}

let indexCache: Map<string, Note> | null = null;

export function notesById(): Map<string, Note> {
  if (!indexCache) {
    indexCache = new Map(loadNotes().notes.map((n) => [n.id, n]));
  }
  return indexCache;
}

/** Permalink to a line in the pinned GHC tree. */
export function sourceUrl(file: string, line: number, opts: { mirror?: boolean } = {}): string {
  const tmpl = opts.mirror ? pin.mirror.blobUrl : pin.canonical.blobUrl;
  return tmpl.replace('{tag}', pin.tag).replace('{path}', file).replace('{line}', String(line));
}

/** Permalink to a GHC issue, as referenced by `#12345` in Note bodies. */
export function issueUrl(id: string): string {
  return pin.canonical.issueUrl.replace('{id}', id);
}

/** Short display form: `GHC/Tc/Solver.hs:412` */
export function shortLocation(file: string, line: number): string {
  return `${file.replace(/^compiler\//, '')}:${line}`;
}
