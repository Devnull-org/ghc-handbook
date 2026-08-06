#!/usr/bin/env bash
# Fetch the GHC source tree at the pinned tag.
#
# Uses a shallow, blobless clone of the GitHub mirror: we only ever read files,
# so there is no reason to pay for history or for blobs we never open. Takes
# ~15s and lands in .ghc-src/ (gitignored).
set -euo pipefail

cd "$(dirname "$0")/.."

PIN_FILE="ghc-pin.json"
read_pin() { node -e "process.stdout.write(require('./$PIN_FILE').$1)"; }

TAG="$(read_pin tag)"
CLONE_URL="$(read_pin mirror.cloneUrl)"
DEST="$(read_pin checkoutDir)"

if [ -d "$DEST/.git" ]; then
  CURRENT="$(git -C "$DEST" describe --tags --exact-match 2>/dev/null || echo '')"
  if [ "$CURRENT" = "$TAG" ]; then
    echo "✓ $DEST already at $TAG"
    exit 0
  fi
  echo "→ $DEST is at '${CURRENT:-unknown}', want $TAG — refetching"
  rm -rf "$DEST"
fi

echo "→ cloning $CLONE_URL @ $TAG into $DEST"
git clone \
  --depth 1 \
  --filter=blob:none \
  --branch "$TAG" \
  --single-branch \
  "$CLONE_URL" "$DEST"

ACTUAL="$(git -C "$DEST" describe --tags --exact-match 2>/dev/null || echo '')"
if [ "$ACTUAL" != "$TAG" ]; then
  echo "✗ checkout is at '$ACTUAL', expected '$TAG'" >&2
  exit 1
fi

echo "✓ $DEST at $TAG"
