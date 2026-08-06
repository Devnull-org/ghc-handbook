#!/usr/bin/env bash
# Generate the compiler-stage dumps the site's example explorer renders.
#
# Finds the compiler in this order, first hit wins:
#
#   1. $GHC
#   2. vendor/ghc/_build/stage2/bin/ghc     (your build)
#   3. vendor/ghc/_build/stage1/bin/ghc
#   4. ghc on PATH
#
# Output lands in data/dumps/ and is committed, so the site builds with no GHC
# and no network. Nothing else in the build touches the Haskell toolchain.
#
#   scripts/gen-dumps.sh
#   GHC=/path/to/ghc scripts/gen-dumps.sh
#   ALLOW_GHC_MISMATCH=1 scripts/gen-dumps.sh    # generate despite a version mismatch
set -euo pipefail

cd "$(dirname "$0")/.."

# The version guard lives in gen-dumps.mjs, which is what resolves the compiler:
# duplicating the lookup here would let the two disagree about which GHC ran.
exec node scripts/gen-dumps.mjs "$@"
