#!/usr/bin/env node
/**
 * Compile each example in examples/ and capture GHC's intermediate
 * representations at every stage the handbook shows.
 *
 * Invoked via scripts/gen-dumps.sh, which performs the version guard first.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupGhc } from './lib/toolchain.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pin = JSON.parse(readFileSync(join(ROOT, 'ghc-pin.json'), 'utf8'));

const OUT = join(ROOT, 'data', 'dumps');
const WORK = join(ROOT, '.dump-tmp');

/** Stage id -> the `-ddump-*` flag that produces it. */
const STAGES = [
  ['parsed-ast', '-ddump-parsed-ast'],
  ['parsed', '-ddump-parsed'],
  ['renamed', '-ddump-rn'],
  ['typechecked', '-ddump-tc'],
  ['types', '-ddump-types'],
  ['core-desugared', '-ddump-ds'],
  ['core-optimised', '-ddump-simpl'],
  ['stg', '-ddump-stg-final'],
];

/**
 * `-dsuppress-uniques` is applied to BOTH variants, not only the readable one.
 * Uniques shift between runs and between GHC builds; without pinning them the
 * committed dumps would churn on every regeneration and every diff would be
 * noise. The readable/full toggle is therefore about the *other* suppressions
 * (type applications, coercions, IdInfo), which is the distinction that actually
 * teaches something about Core.
 */
/**
 * `-fprint-typechecker-elaboration` is not cosmetic. Without it GHC prints the
 * typechecked program to look like the renamed one: no AbsBinds, no EvBinds,
 * no dictionary applications. That hides the entire point of the stage — the
 * evidence the solver produced — and made the Typechecked tab a duplicate of
 * the Renamed tab.
 */
const COMMON = [
  '-fforce-recomp',
  '-O',
  '-ddump-to-file',
  '-dsuppress-uniques',
  '-fprint-typechecker-elaboration',
];
const READABLE_ONLY = [
  '-dsuppress-idinfo',
  '-dsuppress-coercions',
  '-dsuppress-type-applications',
  '-dsuppress-module-prefixes',
  '-dsuppress-var-kinds',
];

const { GHC, ghcVersion, ghcPath, ghcStage, stale } = setupGhc(pin, ROOT, 'scripts/gen-dumps.sh');

function compile(src, outDir, variant) {
  mkdirSync(outDir, { recursive: true });
  const flags = [
    ...COMMON,
    ...(variant === 'readable' ? READABLE_ONLY : []),
    ...STAGES.map(([, flag]) => flag),
    '-outputdir',
    outDir,
    `-ddump-file-prefix=${outDir}/`,
    src,
  ];
  try {
    execFileSync(GHC, flags, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    console.error(`✗ ghc failed on ${src} (${variant})`);
    console.error(err.stderr || err.message);
    process.exit(1);
  }
}

/**
 * GHC writes `<prefix>dump-simpl` for `-ddump-simpl`. Resolve defensively:
 * flag names and dump filenames have drifted between releases, so fall back to
 * scanning the directory rather than silently emitting a null stage.
 */
function readDump(dir, flag) {
  const suffix = flag.replace(/^-ddump-/, '');
  const direct = join(dir, `dump-${suffix}`);
  if (existsSync(direct)) return readFileSync(direct, 'utf8');

  const found = readdirSync(dir).find((f) => f.endsWith(`dump-${suffix}`));
  return found ? readFileSync(join(dir, found), 'utf8') : null;
}

/**
 * Normalise a dump for display and, crucially, for committing.
 *
 * `-ddump-to-file` writes a wall-clock timestamp as the first line and spells
 * every source location as an absolute path. Both change on every run and on
 * every machine, so committed dumps would churn constantly and diffs would be
 * unreadable. Stripping them is what makes regeneration a no-op when nothing
 * has actually changed.
 */
function tidy(text) {
  if (text == null) return null;
  return text
    .split('\n')
    .filter((line) => !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)? UTC$/.test(line.trim()))
    .filter((line) => !/^={4,}.*={4,}$/.test(line.trim()))
    .join('\n')
    .split(ROOT + '/')
    .join('')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '');
}

function main() {
  const examplesDir = join(ROOT, 'examples');
  const sources = readdirSync(examplesDir)
    .filter((f) => f.endsWith('.hs'))
    .sort();

  if (sources.length === 0) {
    console.error('✗ no .hs files in examples/');
    process.exit(1);
  }

  rmSync(OUT, { recursive: true, force: true });
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const manifest = [];

  for (const file of sources) {
    const name = basename(file, '.hs');
    const src = join(examplesDir, file);
    process.stdout.write(`→ ${name}\n`);

    const dirs = {};
    for (const variant of ['readable', 'full']) {
      dirs[variant] = join(WORK, name, variant);
      compile(src, dirs[variant], variant);
    }

    const stages = {};
    for (const [stage, flag] of STAGES) {
      stages[stage] = {
        readable: tidy(readDump(dirs.readable, flag)),
        full: tidy(readDump(dirs.full, flag)),
      };
    }

    const missing = Object.entries(stages)
      .filter(([, v]) => v.readable == null && v.full == null)
      .map(([k]) => k);
    if (missing.length > 0) {
      // Loud, not silent: a stage the site expects but GHC did not emit would
      // otherwise render as a mysteriously empty tab.
      console.warn(`  ⚠ no output for stage(s): ${missing.join(', ')}`);
    }

    writeFileSync(
      join(OUT, `${name}.json`),
      JSON.stringify(
        {
          name,
          source: readFileSync(src, 'utf8'),
          stages,
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
  console.log(`✓ wrote ${manifest.length} example dumps to data/dumps (GHC ${ghcVersion})`);
  if (stale) {
    console.log(`  ⚠ pinned version is ${pin.ghcVersion}; the site will label these as stale.`);
  }
}

main();
