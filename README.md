# GHC Handbook

An interactive handbook for the Glasgow Haskell Compiler, built by reading GHC's
own source: its `Note [...]` comments, its data types, and the reasoning its
authors left behind in the tree.

Pinned to a single GHC release — see [`ghc-pin.json`](./ghc-pin.json).

## Quick start

```sh
npm install
npm run dev
```

That is all you need to work on the site. **No Haskell toolchain is required, and
you do not need the GHC submodule checked out**: the extracted data lives in
`data/` and is committed, so the site builds with no network and no GHC present.

## Layout

```
ghc-pin.json            single source of truth: GHC tag, commit, version, links
vendor/ghc              GHC itself, as a submodule — the tree you build in
scripts/
  fetch-ghc-src.sh      sync vendor/ghc to the pinned commit
  extract-notes.mjs     vendor/ghc -> data/notes.json
  gen-dumps.sh          runs your built GHC over examples/ -> data/dumps/
  lib/notes.mjs         the Note parser (unit-tested)
  lib/walk.mjs          source discovery + the build-output exclusions
examples/               small .hs programs the site shows compiler output for
data/                   committed generated artifacts
src/content/chapters/   the prose, as MDX
src/components/         ExampleExplorer, NoteCard, ...
```

## The vendored GHC

`vendor/ghc` is a submodule pinned to an exact commit, and it serves two
purposes: the extractor reads Notes out of it, and it is the tree you build GHC
in. Building in it is expected — `.gitmodules` sets `ignore = dirty` so the
resulting `_build/` does not show up as changes in this repo.

```sh
# Enough to regenerate Notes:
npm run fetch-src          # git submodule update --init vendor/ghc

# Additionally needed to *build* GHC:
git -C vendor/ghc submodule update --init --recursive
```

That second command is deliberately separate. GHC declares 33 submodules of its
own (`Cabal`, `containers`, `bytestring`, …) which the build needs but the
extractor does not: every Note under `libraries/` comes from a package that
lives in GHC's main repo (`ghc-internal`, `ghci`, `ghc-boot`, `base`).

To repoint the submodule at a different remote — a fork, or a clone in your own
org — edit the `url` in `.gitmodules`, then `git submodule sync vendor/ghc`. No
data needs regenerating if the commit is unchanged.

## Regenerating the data

Two generated artifacts are committed. They only need regenerating when the
pinned GHC version changes, or when you add an example.

### Notes — no compiler needed, just the checkout

```sh
npm run regen        # fetch-ghc-src.sh && extract-notes.mjs
```

Output goes to `data/notes.json`, plus `data/notes-diagnostics.json` listing
references that could not be resolved — mostly GHC's own drift, where a Note was
renamed or removed and the comments pointing at it were left behind.

`fetch-ghc-src.sh` refuses to proceed if `vendor/ghc` is not at the commit in
`ghc-pin.json`, since extracting from a different tree would produce line numbers
that disagree with the site's source links. If you have deliberately moved the
checkout, update `commit` in `ghc-pin.json` and regenerate.

### Compiler dumps — needs a built GHC

`data/dumps/` holds what GHC prints for each example at each stage
(`-ddump-parsed-ast`, `-ddump-rn`, `-ddump-tc`, `-ddump-ds`, `-ddump-simpl`,
`-ddump-stg-final`), in both a readable and a full-detail variant.

```sh
scripts/gen-dumps.sh
```

It finds a compiler in this order, first hit wins:

1. `$GHC`
2. `vendor/ghc/_build/stage2/bin/ghc` — your build
3. `vendor/ghc/_build/stage1/bin/ghc`
4. `ghc` on `PATH`

So after building in `vendor/ghc` it just works, with no configuration. Override
with `GHC=/path/to/ghc scripts/gen-dumps.sh`.

The script compares the compiler's version against `ghc-pin.json` and **refuses
to run on a mismatch**, because a dump from the wrong compiler is not obviously
wrong when you read it — it is subtly wrong, and it would be committed. To
override deliberately:

```sh
ALLOW_GHC_MISMATCH=1 scripts/gen-dumps.sh
```

Each dump records the compiler version *and* which binary produced it, so a
stage1 dump is distinguishable from a stage2 one after the fact.

Dumps generated that way are stamped with the real version, and the site labels
them as stale.

Output is normalised — timestamps and absolute paths stripped — so regenerating
without changing anything produces a byte-identical result and an empty diff.

## Re-pinning to a new GHC release

1. Move the submodule: `git -C vendor/ghc fetch origin --tags && git -C vendor/ghc checkout <tag>`
2. Update `tag`, `commit` (`git -C vendor/ghc rev-parse HEAD`) and `ghcVersion`
   in `ghc-pin.json`.
3. `npm run regen`
4. Rebuild GHC, then `scripts/gen-dumps.sh`.
5. Commit the moved submodule pointer along with the regenerated `data/`.
6. Check the chapters: `NoteCard` throws at build time if a Note id no longer
   exists, which is deliberate — a renamed Note should break the build rather
   than silently vanish from a chapter.

## Testing

```sh
npm test       # Note parser unit tests
npm run build  # full static build; also the check that no GHC is needed
```

## Licence

GHC is licensed under a
[BSD-3-Clause licence](https://gitlab.haskell.org/ghc/ghc/-/blob/master/LICENSE).
Quoted comments and code excerpts remain under that licence and belong to their
authors. This handbook is not affiliated with or endorsed by the GHC project.
