#!/usr/bin/env node
/**
 * Extract every `Note [...]` from the pinned GHC checkout into data/notes.json.
 *
 * Run after scripts/fetch-ghc-src.sh. The output is committed so the site builds
 * with no network and no GHC checkout present.
 *
 *   node scripts/extract-notes.mjs [--quiet]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseSource, resolveNotes } from './lib/notes.mjs';
import { walkSources } from './lib/walk.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(readFileSync(join(ROOT, 'ghc-pin.json'), 'utf8'));
const SRC = join(ROOT, pin.checkoutDir);
const QUIET = process.argv.includes('--quiet');

/** Which part of the tree a note came from, so the site can scope/filter. */
function areaOf(relPath) {
  const root = relPath.split('/')[0];
  return root === 'compiler' ? 'compiler' : root === 'rts' ? 'rts' : 'libraries';
}

/**
 * The commit actually checked out in vendor/ghc.
 *
 * Recorded in the output so a notes.json can always be traced to the exact tree
 * it came from. A tag is not enough once you are building from a checkout you
 * control and may have patched.
 */
function checkedOutCommit() {
  try {
    return execFileSync('git', ['-C', SRC, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function main() {
  let files = [];
  for (const root of pin.sourceRoots) {
    const dir = join(SRC, root);
    try {
      files.push(...walkSources(dir));
    } catch {
      console.error(
        `✗ cannot read ${dir}\n` +
          `  vendor/ghc looks uninitialised. Run:  npm run fetch-src\n` +
          `  (that is 'git submodule update --init ${pin.checkoutDir}' plus a commit check).`,
      );
      process.exit(1);
    }
  }

  const commit = checkedOutCommit();
  if (pin.commit && commit && commit !== pin.commit) {
    console.warn(
      `⚠ ${pin.checkoutDir} is at ${commit.slice(0, 12)}, but ghc-pin.json pins ` +
        `${pin.commit.slice(0, 12)} (${pin.tag}).\n` +
        `  Extracting anyway: the output records the commit actually read, but the\n` +
        `  site's source links are built from the pin, so line numbers may disagree.`,
    );
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
    // into ghc-internal resolve, but base's own internal cross-talk is not
    // part of a compiler handbook, and counting it would drown the signal.
    if (referenceRoots.has(area)) allRefs.push(...references);
  }

  // Duplicate ids mean two Notes with the same title in one module. Rare, but
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
    generatedFrom: { tag: pin.tag, commit, ghcVersion: pin.ghcVersion },
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
