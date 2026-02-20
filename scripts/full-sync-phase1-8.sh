#!/usr/bin/env bash
# Full GitHub Sync Script: Phase 1 -> Phase 8
# Purpose: validate, stage, commit, tag, and optionally push release artifacts.

set -euo pipefail

BRANCH="${BRANCH:-full-sync}"
TAG="${TAG:-v8.0-full}"
REMOTE="${REMOTE:-origin}"
SKIP_PUSH="${SKIP_PUSH:-0}"
COMMIT_MSG="${COMMIT_MSG:-[phase8/full-implementation] FR-P8-1101..1120}"

echo "[INFO] Checking out branch ${BRANCH}..."
git checkout -B "${BRANCH}"

echo "[INFO] Installing dependencies..."
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

echo "[INFO] Building project..."
npm run build

echo "[INFO] Running unit/integration tests..."
npm test

echo "[INFO] Running E2E tests..."
npm run test:e2e

echo "[INFO] Running performance tests..."
npm run test:performance

echo "[INFO] Running security tests..."
npm run test:security

echo "[INFO] Running chaos tests..."
npm run test:chaos

echo "[INFO] Running CI gate..."
npm run ci:gate

echo "[INFO] Running regression spot-check against Phase 1-7 critical suites..."
npx vitest run test/phase1.api.test.ts test/phase7.modules.test.ts

echo "[INFO] Staging source, tests, UI, and docs..."
git add \
  src \
  test \
  e2e \
  web \
  docs \
  scripts \
  supabase \
  package.json \
  package-lock.json \
  tsconfig.json \
  vitest.config.ts \
  playwright.config.ts

if git diff --cached --quiet; then
  echo "[INFO] No staged changes to commit."
else
  echo "[INFO] Committing full sync..."
  git commit -m "${COMMIT_MSG}"
fi

if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  echo "[INFO] Replacing existing local tag ${TAG}..."
  git tag -d "${TAG}"
fi

echo "[INFO] Tagging release ${TAG}..."
git tag -a "${TAG}" -m "Full application release: Phase 1 -> Phase 8"

if [[ "${SKIP_PUSH}" == "1" ]]; then
  echo "[WARN] SKIP_PUSH=1 set; skipping branch/tag push."
else
  echo "[INFO] Pushing branch and tag to ${REMOTE}..."
  git push -u "${REMOTE}" "${BRANCH}"
  git push "${REMOTE}" "${TAG}"
fi

echo "[SUCCESS] Full Phase 1 -> 8 sync completed, tests passed, governance updated."
echo "Branch: ${BRANCH}, Tag: ${TAG}"
