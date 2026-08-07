# GHC Handbook

An interactive handbook for the Glasgow Haskell Compiler, built by reading GHC's
own source: its `Note [...]` comments, its data types, and the reasoning its
authors left behind in the tree.

Pinned to a single GHC release: see [`ghc-pin.json`](./ghc-pin.json).

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
vendor/ghc              GHC itself, as a submodule: the tree you build in
scripts/
  fetch-ghc-src.sh      sync vendor/ghc to the pinned commit
  extract-notes.mjs     vendor/ghc -> data/notes.json
  gen-dumps.sh          runs your built GHC over examples/ -> data/dumps/
  gen-traces.sh         runs it with -ddump-*-trace over examples/traces/ -> data/traces/
  gen-journey.mjs       resolves the function ledger -> data/journey.json
  lib/notes.mjs         the Note parser (unit-tested)
  lib/trace.mjs         the trace-to-tree parser (unit-tested)
  lib/journey.mjs       the journey page's function ledger (unit-tested)
  lib/toolchain.mjs     compiler lookup + version/stage guards, shared by both generators
  lib/walk.mjs          source discovery + the build-output exclusions
examples/               small .hs programs the site shows compiler output for
examples/traces/        even smaller ones the site shows compiler *traces* for
data/                   committed generated artifacts
src/content/chapters/   the prose, as MDX
src/components/         ExampleExplorer, NoteCard, ...
```

## The vendored GHC

`vendor/ghc` is a submodule pinned to an exact commit, and it serves two
purposes: the extractor reads Notes out of it, and it is the tree you build GHC
in. Building in it is expected: `.gitmodules` sets `ignore = dirty` so the
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

To repoint the submodule at a different remote (a fork, or a clone in your own
org), edit the `url` in `.gitmodules`, then `git submodule sync vendor/ghc`. No
data needs regenerating if the commit is unchanged.

### Building it

```sh
cd vendor/ghc
git submodule update --init --recursive   # GHC's own 33 submodules
./boot && ./configure
hadrian/build -j --flavour=quick
```

Then, from the handbook root, `scripts/gen-dumps.sh`. No arguments and no `$GHC`
are needed. Build products land in `vendor/ghc/_build/`, which is gitignored, and
`.gitmodules` sets `ignore = dirty` so they never show up as changes here.

**`--flavour=quick` is the right choice**, and not for the reason it looks like.
It applies `-O0` to the *compiler itself*, which is what makes the build fast,
but `hadrian/src/Settings/Flavours/Quick.hs` keeps `hsLibrary = notStage0 ? arg
"-O"`, so `base` and `ghc-internal` are still built optimised. Their unfoldings
and `RULES` survive, which is what the fusion and worker/wrapper chapters depend
on. Same dumps, much less waiting.

GHC 9.14 ships no in-tree Nix expression: there is no `shell.nix` or `flake.nix`
anywhere in `vendor/ghc`. The Nix route is the separate `ghc.nix` project, linked
from the [building preparation
wiki](https://gitlab.haskell.org/ghc/ghc/-/wikis/building/preparation). It
supplies the toolchain and changes nothing above.

## Regenerating the data

Two generated artifacts are committed. They only need regenerating when the
pinned GHC version changes, or when you add an example.

### Notes: no compiler needed, just the checkout

```sh
npm run regen        # fetch-ghc-src.sh && extract-notes.mjs
```

Output goes to `data/notes.json`, plus `data/notes-diagnostics.json` listing
references that could not be resolved. Most of those are GHC's own drift, where a
Note was renamed or removed and the comments pointing at it were left behind.

`npm run regen` also runs `gen-journey.mjs`, which resolves the "follow one
module" page's function ledger (`scripts/lib/journey.mjs`) to exact line numbers
in the checkout and writes `data/journey.json`. It refuses to write anything if
a ledger pattern no longer matches, so a re-pin that moves a function breaks
regeneration loudly instead of publishing a dead link.

`fetch-ghc-src.sh` refuses to proceed if `vendor/ghc` is not at the commit in
`ghc-pin.json`, since extracting from a different tree would produce line numbers
that disagree with the site's source links. If you have deliberately moved the
checkout, update `commit` in `ghc-pin.json` and regenerate.

### Compiler dumps: needs a built GHC

`data/dumps/` holds what GHC prints for each example at each stage
(`-ddump-parsed-ast`, `-ddump-rn`, `-ddump-tc`, `-ddump-ds`, `-ddump-simpl`,
`-ddump-stg-final`), in both a readable and a full-detail variant.

```sh
scripts/gen-dumps.sh
```

It finds a compiler in this order, first hit wins:

1. `$GHC`
2. `vendor/ghc/_build/stage1/bin/ghc` (the **stage 2** compiler, i.e. your build)
3. `vendor/ghc/_build/stage0/bin/ghc` (the **stage 1** compiler, a fallback)
4. `ghc` on `PATH`

Those look off by one, and they are not. Hadrian names `_build/stageN/` after the
stage that *built* the artifact, so the stage 2 compiler lands in
`_build/stage1/`. `_build/stage2/` would hold stage 3, which a normal build never
produces. The lookup ignores it rather than picking one up silently.

Preferring stage 2 matters: a stage 1 compiler links the *bootstrap* compiler's
`base`, so its optimised Core and STG can differ on exactly the examples the
optimisation chapters teach from. Falling back to it warns.

So after building in `vendor/ghc` it just works, with no configuration. Override
with `GHC=/path/to/ghc scripts/gen-dumps.sh`.

The script compares the compiler's version against `ghc-pin.json` and **refuses
to run on a mismatch**, because a dump from the wrong compiler is not obviously
wrong when you read it: it is subtly wrong, and it would be committed. To
override deliberately:

```sh
ALLOW_GHC_MISMATCH=1 scripts/gen-dumps.sh
```

Each dump records the compiler version, the binary that produced it, and a
`ghcStage` field (`"2"`, `"1"`, or `"external"`). Every stage reports the same
`--numeric-version`, so without that field a stage 1 dump is indistinguishable
from a stage 2 one after the fact.

Dumps generated that way are stamped with the real version, and the site labels
them as stale.

Output is normalised (timestamps and absolute paths stripped), so regenerating
without changing anything produces a byte-identical result and an empty diff.

### Compiler traces: needs a built GHC

`data/traces/` holds GHC's own working (`-ddump-rn-trace`, `-ddump-tc-trace`,
`-ddump-simpl-iterations`, `-ddump-rule-firings`) for the deliberately tiny
modules in `examples/traces/`, parsed into the fold-out trees the site's trace
pages render.

```sh
scripts/gen-traces.sh
```

Compiler lookup, the version guard, `ALLOW_GHC_MISMATCH=1` and the
byte-identical-regeneration property all work exactly as for `gen-dumps.sh`;
both scripts share `scripts/lib/toolchain.mjs`. Regenerate both together when
the pin moves:

```sh
scripts/gen-dumps.sh && scripts/gen-traces.sh
```

The modules in `examples/traces/` are separate from `examples/` and should stay
tiny: `tc-trace` output grows brutally with program size, and the whole point of
the trace pages is that every printed step is legible.

## Re-pinning to a new GHC release

1. Move the submodule: `git -C vendor/ghc fetch origin --tags && git -C vendor/ghc checkout <tag>`
2. Update `tag`, `commit` (`git -C vendor/ghc rev-parse HEAD`) and `ghcVersion`
   in `ghc-pin.json`.
3. `npm run regen`
4. Rebuild GHC, then `scripts/gen-dumps.sh && scripts/gen-traces.sh`.
5. Commit the moved submodule pointer along with the regenerated `data/`.
6. Check the chapters: `NoteCard` throws at build time if a Note id no longer
   exists, which is deliberate: a renamed Note should break the build rather
   than silently vanish from a chapter.

## Testing

```sh
npm test       # Note parser + trace parser unit tests
npm run build  # full static build; also the check that no GHC is needed
```

## Licence

GHC is licensed under a
[BSD-3-Clause licence](https://gitlab.haskell.org/ghc/ghc/-/blob/master/LICENSE).
Quoted comments and code excerpts remain under that licence and belong to their
authors. This handbook is not affiliated with or endorsed by the GHC project.
