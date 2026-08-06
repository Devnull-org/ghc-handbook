import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkSources, IGNORED_DIRS, SOURCE_EXTENSIONS } from './walk.mjs';

/**
 * A fake filesystem, so this test needs no GHC checkout and cannot be fooled by
 * whatever happens to be on disk.
 */
function fakeFs(tree) {
  const entries = (dir) => {
    const prefix = dir === '.' ? '' : dir + '/';
    const names = new Set();
    for (const path of tree) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest === '') continue;
      names.add(rest.split('/')[0]);
    }
    return [...names];
  };
  const isDir = (path) => tree.some((p) => p.startsWith(path + '/'));
  return {
    readdirSync: entries,
    statSync: (path) => ({ isDirectory: () => isDir(path) }),
  };
}

test('build output inside a scanned root is never walked', () => {
  // These are the shapes that actually bite: Hadrian's top-level _build sits
  // outside the scanned roots, but cabal and the old build system leave
  // dist-newstyle/_build directories *inside* compiler/ and libraries/, where
  // generated modules carry the same Note text as the real ones.
  const fs = fakeFs([
    'compiler/GHC/Tc/Solver.hs',
    'compiler/_build/Generated.hs',
    'compiler/stage1/build/Old.hs',
    'libraries/ghc-internal/src/GHC/Internal/Base.hs',
    'libraries/dist-newstyle/Generated.hs',
    'libraries/base/dist-install/Generated.hs',
    'rts/Schedule.c',
  ]);

  const found = walkSources('compiler', [], fs)
    .concat(walkSources('libraries', [], fs))
    .concat(walkSources('rts', [], fs));

  assert.ok(found.includes('compiler/GHC/Tc/Solver.hs'), 'real sources are still found');
  assert.ok(found.includes('libraries/ghc-internal/src/GHC/Internal/Base.hs'));
  assert.ok(found.includes('rts/Schedule.c'), 'RTS C sources are found');

  for (const leaked of [
    'compiler/_build/Generated.hs',
    'libraries/dist-newstyle/Generated.hs',
    'libraries/base/dist-install/Generated.hs',
  ]) {
    assert.ok(!found.includes(leaked), `must not walk build output: ${leaked}`);
  }
});

test('the testsuite is excluded', () => {
  const fs = fakeFs(['testsuite/tests/parser/Bad.hs', 'compiler/GHC/Real.hs']);
  const found = walkSources('.', [], fs);
  assert.deepEqual(found, ['compiler/GHC/Real.hs']);
});

test('guard set still names the build directories it exists for', () => {
  // A cheap tripwire: deleting one of these from IGNORED_DIRS would otherwise
  // only show up as a mysterious jump in the note count after someone builds.
  for (const dir of ['_build', 'dist-newstyle', 'dist-install', 'testsuite']) {
    assert.ok(IGNORED_DIRS.has(dir), `${dir} must stay excluded`);
  }
});

test('non-source files are ignored', () => {
  const fs = fakeFs(['compiler/GHC/Real.hs', 'compiler/README.md', 'compiler/ghc.cabal']);
  assert.deepEqual(walkSources('compiler', [], fs), ['compiler/GHC/Real.hs']);
  assert.ok(SOURCE_EXTENSIONS.includes('.cmm'), 'Cmm sources carry RTS Notes');
});
