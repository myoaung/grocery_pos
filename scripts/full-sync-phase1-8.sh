#!/bin/bash
set -euo pipefail

# Full Sync Script: Phase 1-8
# Usage:
#   SKIP_PUSH=1 bash scripts/full-sync-phase1-8.sh   # dry-run

BRANCH="${BRANCH:-full-sync}"
REMOTE="${REMOTE:-origin}"
SKIP_PUSH="${SKIP_PUSH:-0}" # default = 0 -> push enabled

echo "=== Phase 1-8 Full Sync ==="

echo "0. Ensure branch ${BRANCH}"
git checkout "$BRANCH" >/dev/null 2>&1 || git checkout -b "$BRANCH"

echo "1. Install dependencies"
npm ci

echo "2. Build project"
npm run build

echo "3. Run tests"
npm test
npm run test:e2e
npm run test:performance
npm run test:security
npm run test:chaos

echo "4. Run CI gates"
npm run ci:gate

echo "5. Stage all updated files"
git add .

# Keep transient runtime folders out of automated commits when no .gitignore is present.
git reset -q HEAD -- node_modules dist test-results 2>/dev/null || true

LAST_PHASE="$(git log -1 --pretty=%B | head -n 1)"
COMMIT_MSG="[full-sync/auto] ${LAST_PHASE} - Verified all gates"

git commit -m "$COMMIT_MSG" || echo "No changes to commit"

# Auto-create next version tag from latest v*-full tag.
LAST_TAG="$(git tag --list "v*-full" --sort=-creatordate | head -n 1)"
if [[ -z "${LAST_TAG}" ]]; then
  LAST_TAG="v0.0-full"
fi
TAG_VERSION="${LAST_TAG#v}"
TAG_VERSION="${TAG_VERSION%-full}"
MAJOR="${TAG_VERSION%%.*}"
MINOR="${TAG_VERSION#*.}"
if [[ -z "${MAJOR}" || -z "${MINOR}" || "${MAJOR}" == "${MINOR}" ]]; then
  MAJOR="0"
  MINOR="0"
fi
NEW_TAG="v${MAJOR}.$((MINOR + 1))-full"

git tag -f "$NEW_TAG"
echo "Created tag: $NEW_TAG"

if [[ "$SKIP_PUSH" -eq 0 ]]; then
  echo "All tests passed. Pushing to GitHub..."
  git push "$REMOTE" "$BRANCH"
  git push "$REMOTE" --tags
else
  echo "Push skipped (SKIP_PUSH=1)"
fi

echo "=== Full Sync Complete ==="
echo "Branch: $BRANCH"
echo "Tag: $NEW_TAG"
echo "SKIP_PUSH: $SKIP_PUSH"
