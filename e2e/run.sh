#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
project="viweb-browser-$(date +%s)-$$"
compose=(docker compose --project-name "$project" --file e2e/compose.yaml)

cleanup() {
  result=$?
  if (( result != 0 )); then
    "${compose[@]}" logs --no-color --tail=100 || true
  fi
  "${compose[@]}" down --volumes --rmi local --remove-orphans
  exit "$result"
}
trap cleanup EXIT

"${compose[@]}" up --build --detach --wait --wait-timeout 120
npm exec --no -- playwright test --config e2e/playwright.config.ts "$@"
