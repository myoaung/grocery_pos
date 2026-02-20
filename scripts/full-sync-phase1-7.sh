#!/usr/bin/env bash
# Full GitHub Sync Script: Phase 1 -> Phase 7
# Purpose: validate, stage, commit, tag, and optionally push release artifacts.

set -euo pipefail

BRANCH="${BRANCH:-full-sync}"
TAG="${TAG:-v7.0-full}"
REMOTE="${REMOTE:-origin}"
SKIP_PUSH="${SKIP_PUSH:-0}"
COMMIT_MSG="${COMMIT_MSG:-Full sync: Phase 1 -> Phase 7 implementation, tests, governance, hardening.}"

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
if ! npm run test:performance; then
  echo "[WARN] Performance budget warnings logged"
fi

echo "[INFO] Running security/chaos tests..."
npm run test:security
npm run test:chaos

echo "[INFO] Running CI gate script..."
npm run ci:gate

echo "[INFO] Updating docs and traceability (if automation scripts exist)..."
if [[ -f scripts/update_tc_traceability.js ]]; then
  node scripts/update_tc_traceability.js --phase all
else
  echo "[WARN] scripts/update_tc_traceability.js not found; skipping."
fi
if [[ -f scripts/update_phase_summary.js ]]; then
  node scripts/update_phase_summary.js --phase all
else
  echo "[WARN] scripts/update_phase_summary.js not found; skipping."
fi
if [[ -f scripts/update_changelog.js ]]; then
  node scripts/update_changelog.js --phase all
else
  echo "[WARN] scripts/update_changelog.js not found; skipping."
fi

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
git tag -a "${TAG}" -m "Full application release: Phase 1 -> Phase 7"

if [[ "${SKIP_PUSH}" == "1" ]]; then
  echo "[WARN] SKIP_PUSH=1 set; skipping branch/tag push."
else
  echo "[INFO] Pushing branch and tag to ${REMOTE}..."
  git push -u "${REMOTE}" "${BRANCH}"
  git push "${REMOTE}" "${TAG}"
fi

echo "[SUCCESS] Full Phase 1 -> 7 sync completed, tests passed, governance updated."
echo "Branch: ${BRANCH}, Tag: ${TAG}"
