/**
 * Source-file discovery for the Note extractor.
 *
 * Lives apart from the parser because *which files we look at* is a correctness
 * concern in its own right: vendor/ghc is the tree GHC is built in, and build
 * output that lands inside a scanned root would otherwise be mined for Notes.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Directories never descended into.
 *
 * Build output is the point. Hadrian keeps its output in a top-level `_build`,
 * which is outside the scanned roots — but cabal and older build systems leave
 * `dist-newstyle`, `dist` and `_build` directories *inside* `compiler/` and
 * `libraries/`, and those are scanned. A generated module carries the same
 * `Note [...]` text as the real one, so without this the extractor mints
 * duplicate Notes that collide in the id namespace — silently, and only after
 * the first build.
 *
 * `testsuite` is excluded for a different reason: its .hs files are test inputs,
 * often deliberately malformed, and are not part of the compiler's design record.
 */
export const IGNORED_DIRS = new Set([
  '.git',
  '_build',
  '_validatebuild',
  'inplace',
  'dist',
  'dist-newstyle',
  'dist-install',
  'testsuite',
  'tests',
]);

/** Haskell carries most Notes; the RTS keeps its own in C and Cmm. */
export const SOURCE_EXTENSIONS = ['.hs', '.hs-boot', '.y', '.x', '.c', '.h', '.cmm'];

/** Recursively collect source files under `dir`, skipping IGNORED_DIRS. */
export function walkSources(dir, out = [], deps = { readdirSync, statSync }) {
  for (const entry of deps.readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (deps.statSync(full).isDirectory()) walkSources(full, out, deps);
    else if (SOURCE_EXTENSIONS.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}
