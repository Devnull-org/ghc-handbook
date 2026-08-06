#!/usr/bin/env bash
# Bring the vendored GHC checkout up to the pinned commit.
#
# GHC lives at vendor/ghc as a submodule. That checkout is the single source of
# truth: the Note extractor reads it, and it is the tree you build in.
set -euo pipefail

cd "$(dirname "$0")/.."

read_pin() { node -e "process.stdout.write(String(require('./ghc-pin.json').$1))"; }
DEST="$(read_pin checkoutDir)"
TAG="$(read_pin tag)"
WANT_COMMIT="$(read_pin commit)"

# Deliberately NOT --recursive. GHC declares 33 submodules of its own (Cabal,
# containers, bytestring, ...) which are needed to *build* it but not to read
# it: every Note under libraries/ comes from a package that lives in the main
# repo (ghc-internal, ghci, ghc-boot, base). Initialising them here would cost
# a lot of bandwidth for nothing. If you are building, run:
#
#     git -C vendor/ghc submodule update --init --recursive
#
echo "→ syncing $DEST to $TAG"
git submodule update --init "$DEST"

HAVE_COMMIT="$(git -C "$DEST" rev-parse HEAD)"

if [ "$HAVE_COMMIT" != "$WANT_COMMIT" ]; then
  echo "✗ $DEST is not at the pinned commit" >&2
  echo "    checked out : $HAVE_COMMIT" >&2
  echo "    pinned      : $WANT_COMMIT  ($TAG)" >&2
  echo "" >&2
  echo "  Extracting from a different tree than the one recorded would produce" >&2
  echo "  Notes whose line numbers disagree with the site's source links." >&2
  echo "" >&2
  echo "  To move the pin to what is checked out, set \"commit\" in ghc-pin.json" >&2
  echo "  to $HAVE_COMMIT and re-run 'npm run extract'." >&2
  exit 1
fi

echo "✓ $DEST at $TAG ($HAVE_COMMIT)"
