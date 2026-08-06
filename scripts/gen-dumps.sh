#!/usr/bin/env bash
# Generate the compiler-stage dumps the site's example explorer renders.
#
# Run this from a shell that has the pinned GHC on PATH:
#
#     nix develop ...      # or however you provide GHC
#     scripts/gen-dumps.sh
#
# Output lands in data/dumps/ and is committed, so the site builds with no GHC
# and no network. Nothing else in the build touches the Haskell toolchain.
set -euo pipefail

cd "$(dirname "$0")/.."

WANT_VERSION="$(node -e "process.stdout.write(require('./ghc-pin.json').ghcVersion)")"
TAG="$(node -e "process.stdout.write(require('./ghc-pin.json').tag)")"

if ! command -v ghc >/dev/null 2>&1; then
  echo "✗ no 'ghc' on PATH." >&2
  echo "  This script needs the pinned compiler (GHC $WANT_VERSION); the site" >&2
  echo "  build itself does not. Enter your nix shell and re-run." >&2
  exit 1
fi

HAVE_VERSION="$(ghc --numeric-version)"

# A dump from the wrong compiler is not obviously wrong when you read it — it is
# subtly wrong, and it would be committed. So a mismatch stops the run outright.
if [ "$HAVE_VERSION" != "$WANT_VERSION" ] && [ "${ALLOW_GHC_MISMATCH:-}" != "1" ]; then
  echo "✗ GHC version mismatch" >&2
  echo "    on PATH : $HAVE_VERSION" >&2
  echo "    pinned  : $WANT_VERSION  (from ghc-pin.json, tag $TAG)" >&2
  echo "" >&2
  echo "  The handbook documents $TAG, so dumps should come from that compiler." >&2
  echo "  To generate anyway (they are stamped with the real version and the" >&2
  echo "  site labels them as stale):" >&2
  echo "    ALLOW_GHC_MISMATCH=1 $0" >&2
  exit 1
fi

exec node scripts/gen-dumps.mjs
