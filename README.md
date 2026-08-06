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

That is all you need to work on the site. **No Haskell toolchain is required**:
the extracted data lives in `data/` and is committed, so the site builds with no
network and no GHC present.

## Layout

```
ghc-pin.json            single source of truth for the GHC version and links
scripts/
  fetch-ghc-src.sh      shallow clone of GHC at the pinned tag -> .ghc-src/
  extract-notes.mjs     .ghc-src -> data/notes.json
  gen-dumps.sh          runs the pinned GHC over examples/ -> data/dumps/
  lib/notes.mjs         the Note parser (unit-tested)
examples/               small .hs programs the site shows compiler output for
data/                   committed generated artifacts
src/content/chapters/   the prose, as MDX
src/components/         ExampleExplorer, NoteCard, ...
```

## Regenerating the data

Two generated artifacts are committed. They only need regenerating when the
pinned GHC version changes, or when you add an example.

### Notes — no GHC needed

```sh
npm run regen        # fetch-ghc-src.sh && extract-notes.mjs
```

The clone is shallow and blobless (~15s). Output goes to `data/notes.json`, plus
`data/notes-diagnostics.json` listing references that could not be resolved —
mostly GHC's own drift, where a Note was renamed or removed and the comments
pointing at it were left behind.

### Compiler dumps — needs the pinned GHC

`data/dumps/` holds what GHC prints for each example at each stage
(`-ddump-parsed-ast`, `-ddump-rn`, `-ddump-tc`, `-ddump-ds`, `-ddump-simpl`,
`-ddump-stg-final`), in both a readable and a full-detail variant.

Run this from a shell that has the pinned compiler on `PATH` — a nix shell, or
however you provide GHC:

```sh
scripts/gen-dumps.sh
```

The script compares `ghc --numeric-version` against `ghc-pin.json` and **refuses
to run on a mismatch**, because a dump from the wrong compiler is not obviously
wrong when you read it — it is subtly wrong, and it would be committed. To
override deliberately:

```sh
ALLOW_GHC_MISMATCH=1 scripts/gen-dumps.sh
```

Dumps generated that way are stamped with the real version, and the site labels
them as stale.

Output is normalised — timestamps and absolute paths stripped — so regenerating
without changing anything produces a byte-identical result and an empty diff.

## Re-pinning to a new GHC release

1. Edit `tag` and `ghcVersion` in `ghc-pin.json`.
2. `npm run regen`
3. `scripts/gen-dumps.sh` under the new compiler.
4. Check the chapters: `NoteCard` throws at build time if a Note id no longer
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
