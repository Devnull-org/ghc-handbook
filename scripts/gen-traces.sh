#!/usr/bin/env bash
# Generate the compiler traces the site's trace explorer renders — GHC's own
# working (-ddump-tc-trace and friends), parsed into fold-out trees.
#
# Compiler lookup, version guard and stage guard are shared with gen-dumps.sh:
# both go through scripts/lib/toolchain.mjs, so the two can never disagree
# about which GHC ran.
#
#   scripts/gen-traces.sh
#   GHC=/path/to/ghc scripts/gen-traces.sh
#   ALLOW_GHC_MISMATCH=1 scripts/gen-traces.sh   # generate despite a version mismatch
set -euo pipefail

cd "$(dirname "$0")/.."

exec node scripts/gen-traces.mjs "$@"
