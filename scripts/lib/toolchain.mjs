/**
 * Locating and vetting the GHC that generates committed artifacts.
 *
 * Shared by gen-dumps.mjs and gen-traces.mjs so the two can never disagree
 * about which compiler ran.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Where Hadrian puts each compiler, most preferred first.
 *
 * Hadrian names `_build/stageN/` after the stage that *built* the artifact, not
 * the artifact's own stage, so the stage 2 compiler lives in `_build/stage1/`.
 * See `hadrian/doc/make.md` in the vendored tree: "Your stage 2 GHC would then
 * be at `_build/stage1/bin/ghc` (because it's built by the stage 1 compiler)."
 *
 * `_build/stage2/bin/ghc` is therefore *stage 3*, which only exists if you asked
 * for it as a smoke test. It is deliberately absent from this list: picking one
 * up silently is worse than not finding a compiler at all.
 */
export const BUILD_TREE_COMPILERS = [
  { dir: 'stage1', stage: '2' },
  { dir: 'stage0', stage: '1' },
];

/**
 * Locate the compiler to generate with.
 *
 * You build GHC in vendor/ghc, so the compiler that matches the source this
 * handbook documents is the one sitting in that build tree, preferred over
 * whatever unrelated GHC happens to be on PATH. `$GHC` overrides everything.
 *
 * Returns the path plus which stage it is, since that cannot be recovered
 * afterwards: every stage reports the same `--numeric-version`.
 */
export function resolveGhc(pin, root) {
  if (process.env.GHC) {
    if (!existsSync(process.env.GHC)) {
      console.error(`✗ $GHC is set to ${process.env.GHC}, which does not exist.`);
      process.exit(1);
    }
    return { path: process.env.GHC, stage: 'external' };
  }

  for (const { dir, stage } of BUILD_TREE_COMPILERS) {
    const candidate = join(root, pin.checkoutDir, '_build', dir, 'bin', 'ghc');
    if (existsSync(candidate)) return { path: candidate, stage };
  }

  try {
    execFileSync('ghc', ['--numeric-version'], { stdio: 'ignore' });
    return { path: 'ghc', stage: 'external' };
  } catch {
    console.error('✗ no GHC found.');
    console.error(`    looked for : $GHC`);
    for (const { dir, stage } of BUILD_TREE_COMPILERS) {
      console.error(`                 ${pin.checkoutDir}/_build/${dir}/bin/ghc  (stage ${stage})`);
    }
    console.error(`                 ghc on PATH`);
    console.error('');
    console.error(`  To build one: cd ${pin.checkoutDir} && ./boot && ./configure && hadrian/build -j`);
    console.error('  Or point $GHC at a compiler you already have.');
    console.error('  The site build itself needs neither: only regeneration does.');
    process.exit(1);
  }
}

/**
 * A dump from the wrong compiler is not obviously wrong when you read it: it is
 * subtly wrong, and it would be committed. So a mismatch stops the run unless it
 * is overridden deliberately.
 */
export function checkVersion(version, path, pin, script) {
  if (version === pin.ghcVersion) return;

  if (process.env.ALLOW_GHC_MISMATCH !== '1') {
    console.error('✗ GHC version mismatch');
    console.error(`    compiler : ${version}  (${path})`);
    console.error(`    pinned   : ${pin.ghcVersion}  (from ghc-pin.json, tag ${pin.tag})`);
    console.error('');
    console.error(`  The handbook documents ${pin.tag}, so output should come from that`);
    console.error('  compiler. To generate anyway (it is stamped with the real version');
    console.error('  and the site labels it as stale):');
    console.error(`    ALLOW_GHC_MISMATCH=1 ${script}`);
    process.exit(1);
  }

  console.warn(`⚠ generating with GHC ${version}, but the handbook is pinned to ${pin.ghcVersion}.`);
  console.warn('  Output will be stamped with the real version and labelled stale.');
}

/**
 * A stage 1 compiler is built by the *bootstrap* compiler and links its `base`,
 * so its optimised Core and STG can differ from a stage 2's on exactly the
 * examples this handbook uses to teach optimisation. Same failure mode as a
 * version mismatch (plausible-looking output that is quietly wrong), so it
 * warns rather than passing silently.
 */
export function checkStage(stage, path) {
  if (stage !== '1') return;
  console.warn(`⚠ ${path} is a stage 1 compiler (Hadrian builds it into _build/stage0/).`);
  console.warn('  It links the bootstrap compiler\'s libraries, so its optimised Core may');
  console.warn('  differ from a stage 2\'s. Run a full `hadrian/build -j` for output you commit.');
}

/**
 * Resolve, version-check and stage-check in one step. Returns everything a
 * generator script needs to run the compiler and stamp its output.
 */
export function setupGhc(pin, root, script) {
  const { path: GHC, stage: ghcStage } = resolveGhc(pin, root);
  const ghcVersion = execFileSync(GHC, ['--numeric-version'], { encoding: 'utf8' }).trim();
  const stale = ghcVersion !== pin.ghcVersion;

  // Every stage reports the same version, so the path alone cannot tell you
  // which compiler produced the output, and under Hadrian's naming the path
  // actively misleads. Record the stage explicitly alongside it. Relativised:
  // an absolute path would leak the generating machine's layout and churn the
  // diff on every contributor.
  const ghcPath = GHC.startsWith(root + '/') ? relative(root, GHC) : GHC;

  checkVersion(ghcVersion, ghcPath, pin, script);
  checkStage(ghcStage, ghcPath);

  return { GHC, ghcVersion, ghcPath, ghcStage, stale };
}
