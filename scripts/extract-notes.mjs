#!/usr/bin/env node
/**
 * Extract every `Note [...]` from the pinned GHC checkout into data/notes.json.
 *
 * Run after scripts/fetch-ghc-src.sh. The output is committed so the site builds
 * with no network and no GHC checkout present.
 *
 *   node scripts/extract-notes.mjs [--quiet]
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSource, resolveNotes } from './lib/notes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(readFileSync(join(ROOT, 'ghc-pin.json'), 'utf8'));
const SRC = join(ROOT, pin.checkoutDir);
const QUIET = process.argv.includes('--quiet');

// Haskell sources carry the bulk of the Notes; the RTS keeps its own in C and
// Cmm, and references reach across the boundary in both directions.
const EXTENSIONS = ['.hs', '.hs-boot', '.y', '.x', '.c', '.h', '.cmm'];

const IGNORED_DIRS = new Set(['dist-newstyle', '.git', 'testsuite', 'tests', 'dist']);

/** Which part of the tree a note came from, so the site can scope/filter. */
function areaOf(relPath) {
  const root = relPath.split('/')[0];
  return root === 'compiler' ? 'compiler' : root === 'rts' ? 'rts' : 'libraries';
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTENSIONS.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

function main() {
  let files = [];
  for (const root of pin.sourceRoots) {
    const dir = join(SRC, root);
    try {
      files.push(...walk(dir));
    } catch {
      console.error(
        `✗ cannot read ${dir}\n  Run scripts/fetch-ghc-src.sh first (fetches GHC ${pin.tag}).`,
      );
      process.exit(1);
    }
  }

  const referenceRoots = new Set(pin.referenceRoots ?? pin.sourceRoots);
  const allDefs = [];
  const allRefs = [];
  for (const file of files) {
    const rel = relative(SRC, file);
    const text = readFileSync(file, 'utf8');
    const { definitions, references } = parseSource(text, rel);
    const area = areaOf(rel);
    for (const d of definitions) d.area = area;
    allDefs.push(...definitions);

    // `libraries/` is scanned for definitions so that compiler Notes pointing
    // into ghc-internal resolve — but base's own internal cross-talk is not
    // part of a compiler handbook, and counting it would drown the signal.
    if (referenceRoots.has(area)) allRefs.push(...references);
  }

  // Duplicate ids mean two Notes with the same title in one module — rare, but
  // it would silently collapse two distinct Notes into one page, so suffix them.
  const seen = new Map();
  for (const d of allDefs) {
    const n = (seen.get(d.id) ?? 0) + 1;
    seen.set(d.id, n);
    if (n > 1) d.id = `${d.id}-${n}`;
  }

  const { notes, unresolved, ambiguous } = resolveNotes(allDefs, allRefs);

  // Sort backlinks for stable, diffable output.
  for (const n of notes) {
    n.refsIn.sort((a, b) => (a.file + a.line).localeCompare(b.file + b.line));
    n.refsOut.sort();
  }
  notes.sort((a, b) => a.id.localeCompare(b.id));

  const byModule = {};
  for (const n of notes) byModule[n.module] = (byModule[n.module] ?? 0) + 1;

  const payload = {
    generatedFrom: { tag: pin.tag, ghcVersion: pin.ghcVersion },
    stats: {
      files: files.length,
      notes: notes.length,
      references: allRefs.length,
      resolved: allRefs.length - unresolved.length - ambiguous.length,
      unresolved: unresolved.length,
      ambiguous: ambiguous.length,
      modules: Object.keys(byModule).length,
    },
    notes,
  };

  mkdirSync(join(ROOT, 'data'), { recursive: true });
  writeFileSync(join(ROOT, 'data', 'notes.json'), JSON.stringify(payload, null, 2) + '\n');

  // Diagnostics are a separate artifact: useful for auditing GHC's own stale
  // cross-references, but not something the site needs to load.
  writeFileSync(
    join(ROOT, 'data', 'notes-diagnostics.json'),
    JSON.stringify({ unresolved, ambiguous }, null, 2) + '\n',
  );

  if (!QUIET) {
    const s = payload.stats;
    console.log(`✓ ${s.notes} notes from ${s.files} files across ${s.modules} modules`);
    console.log(`  references: ${s.references}  resolved: ${s.resolved}`);
    console.log(`  unresolved: ${s.unresolved}  ambiguous: ${s.ambiguous}`);
    const top = Object.entries(byModule)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    console.log('  densest modules:');
    for (const [m, c] of top) console.log(`    ${String(c).padStart(4)}  ${m}`);
  }
}

main();
