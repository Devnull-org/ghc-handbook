#!/usr/bin/env node
/**
 * Resolve the function ledger in scripts/lib/journey.mjs against the pinned
 * GHC checkout and write data/journey.json for the "follow one module" page.
 *
 * Needs vendor/ghc at the pinned commit (like extract-notes.mjs); the site
 * build itself only reads the committed JSON. Refuses to emit anything if a
 * ledger pattern no longer matches, so a re-pin that moves a function breaks
 * regeneration here, never the published page.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEDGER, flattenPaths, resolveLedger } from './lib/journey.mjs';
import { sourceUrl } from './lib/notes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(readFileSync(join(ROOT, 'ghc-pin.json'), 'utf8'));
const CHECKOUT = join(ROOT, pin.checkoutDir);

if (!existsSync(join(CHECKOUT, 'compiler'))) {
  console.error(`✗ ${pin.checkoutDir} is not checked out. Run: npm run fetch-src`);
  process.exit(1);
}

const head = execFileSync('git', ['-C', CHECKOUT, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
if (head !== pin.commit) {
  console.error(`✗ ${pin.checkoutDir} is at ${head}, but ghc-pin.json records ${pin.commit}.`);
  console.error('  Resolving line numbers against a different tree would produce dead links.');
  process.exit(1);
}

const { phases, unresolved, unverified } = resolveLedger(LEDGER, (file) => {
  const path = join(CHECKOUT, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
});

if (unresolved.length > 0 || unverified.length > 0) {
  if (unresolved.length > 0) {
    console.error(`✗ ${unresolved.length} node(s) did not resolve to a definition:`);
    for (const miss of unresolved) console.error(`    ${miss}`);
  }
  if (unverified.length > 0) {
    console.error(`✗ ${unverified.length} call edge(s) could not be verified in the source:`);
    for (const miss of unverified) console.error(`    ${miss}`);
  }
  console.error('');
  console.error('  Either the code moved (update scripts/lib/journey.mjs) or the pin changed');
  console.error('  underneath it. Nothing was written.');
  process.exit(1);
}

/** Attach URLs and drop the resolution pattern, recursively. */
const publish = ({ pattern, children, ...node }) => ({
  ...node,
  url: sourceUrl(pin, node.file, node.line),
  children: children.map(publish),
});

const out = {
  generatedFrom: { tag: pin.tag, commit: pin.commit },
  phases: phases.map((phase) => {
    const paths = phase.paths.map(publish);
    return {
      ...phase,
      paths,
      // Flat view for consumers that need a lookup rather than the tree.
      functions: flattenPaths(paths),
    };
  }),
};

writeFileSync(join(ROOT, 'data', 'journey.json'), JSON.stringify(out, null, 2) + '\n');
const total = out.phases.reduce((n, p) => n + p.functions.length, 0);
console.log(
  `✓ wrote data/journey.json (${out.phases.length} phases, ${total} functions, every call edge verified, ${pin.tag})`,
);
