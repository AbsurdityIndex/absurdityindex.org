#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# merge-votechain.sh — Build VoteChain and merge into main site dist/
# ---------------------------------------------------------------------------
# Expects the votechain repo to be a sibling directory (../votechain).
# Run after `npm run build` to produce a complete dist/ with /votechain/ pages.
#
# Usage:
#   npm run build && bash scripts/merge-votechain.sh
#   # or use the shortcut:
#   npm run build:full
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
VOTECHAIN_DIR="${VOTECHAIN_DIR:-$REPO_ROOT/../votechain}"

if [ ! -d "$VOTECHAIN_DIR" ]; then
  echo "Error: VoteChain repo not found at $VOTECHAIN_DIR"
  echo "Set VOTECHAIN_DIR to override, or clone the repo as a sibling directory."
  exit 1
fi

echo "Building VoteChain from $VOTECHAIN_DIR..."
cd "$VOTECHAIN_DIR"
npm install --silent 2>/dev/null
npm run build

echo "Merging VoteChain into $REPO_ROOT/dist/..."
cp -R "$VOTECHAIN_DIR/dist/votechain/" "$REPO_ROOT/dist/votechain/"
cp -R "$VOTECHAIN_DIR/dist/_astro/"* "$REPO_ROOT/dist/_astro/"

echo "Done. VoteChain pages merged into dist/votechain/"
