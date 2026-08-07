#!/usr/bin/env node
/**
 * Capture GHC's own working (its `-ddump-*-trace` output) for each module in
 * examples/traces/, and parse it into the trees the site's trace explorer
 * renders.
 *
 * These are different artifacts from data/dumps/: a dump shows the program
 * *after* a stage, a trace shows the compiler *during* one. The modules here
 * are deliberately tiny and separate from examples/: the solver chapter's own
 * advice is "start from a three-line module, never a real one", because
 * tc-trace output grows brutally with program size.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupGhc } from './lib/toolchain.mjs';
import { parseTrace } from './lib/trace.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(readFileSync(join(ROOT, 'ghc-pin.json'), 'utf8'));

const EXAMPLES = join(ROOT, 'examples', 'traces');
const OUT = join(ROOT, 'data', 'traces');
const WORK = join(ROOT, '.trace-tmp');

/**
 * Trace id -> flag. One compilation per flag: combining them would interleave
 * their output into one stream with no way to pull it apart again.
 */
const TRACES = [
  ['rn-trace', '-ddump-rn-trace'],
  ['tc-trace', '-ddump-tc-trace'],
  ['simpl-iterations', '-ddump-simpl-iterations'],
  ['rule-firings', '-ddump-rule-firings'],
];

const { GHC, ghcVersion, ghcPath, ghcStage, stale } = setupGhc(pin, ROOT, 'scripts/gen-traces.sh');

/**
 * Strip what would churn the committed diff: absolute paths, and trailing
 * whitespace. Trace output has no timestamp line (that is a -ddump-to-file
 * artifact), so this is lighter than the dump tidy.
 */
function tidy(text) {
  return text.split(ROOT + '/').join('').replace(/\s+$/, '');
}

function runTrace(srcRel, flag) {
  // cwd is ROOT and the source path is relative, so GHC prints relative paths
  // in the trace instead of leaking the generating machine's layout.
  const res = spawnSync(
    GHC,
    ['-fforce-recomp', '-O', '-c', srcRel, flag, '-dsuppress-uniques', '-outputdir', WORK],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  if (res.status !== 0) {
    console.error(`✗ ghc failed on ${srcRel} (${flag})`);
    console.error(res.stderr || res.error?.message || '');
    process.exit(1);
  }
  // This GHC writes traces to stdout; older ones used stderr. Take both:
  // whichever stream is unused carries nothing but warnings.
  return tidy((res.stdout ?? '') + (res.stderr ?? ''));
}

function main() {
  const sources = readdirSync(EXAMPLES)
    .filter((f) => f.endsWith('.hs'))
    .sort();

  if (sources.length === 0) {
    console.error('✗ no .hs files in examples/traces/');
    process.exit(1);
  }

  rmSync(OUT, { recursive: true, force: true });
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  mkdirSync(WORK, { recursive: true });

  const manifest = [];

  for (const file of sources) {
    const name = basename(file, '.hs');
    const srcRel = join('examples', 'traces', file);
    process.stdout.write(`→ ${name}\n`);

    const traces = {};
    for (const [id, flag] of TRACES) {
      const text = runTrace(srcRel, flag);
      traces[id] = { flag, lines: text === '' ? 0 : text.split('\n').length, tree: parseTrace(text) };
    }

    const empty = Object.entries(traces)
      .filter(([, t]) => t.lines === 0)
      .map(([id]) => id);
    if (empty.length > 0) {
      // Loud, not silent: an empty trace the site expects would otherwise
      // render as a mysteriously blank tab.
      console.warn(`  ⚠ no output for trace(s): ${empty.join(', ')}`);
    }

    writeFileSync(
      join(OUT, `${name}.json`),
      JSON.stringify(
        {
          name,
          source: readFileSync(join(ROOT, srcRel), 'utf8'),
          traces,
          ghcVersion,
          ghcPath,
          ghcStage,
          pinnedVersion: pin.ghcVersion,
          stale,
        },
        null,
        2,
      ) + '\n',
    );
    manifest.push(name);
  }

  writeFileSync(
    join(OUT, 'manifest.json'),
    JSON.stringify(
      { ghcVersion, ghcPath, ghcStage, pinnedVersion: pin.ghcVersion, stale, examples: manifest },
      null,
      2,
    ) + '\n',
  );

  rmSync(WORK, { recursive: true, force: true });
  console.log(`✓ wrote ${manifest.length} trace sets to data/traces (GHC ${ghcVersion})`);
  if (stale) {
    console.log(`  ⚠ pinned version is ${pin.ghcVersion}; the site will label these as stale.`);
  }
}

main();
