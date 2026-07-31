#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

pass() {
  printf '[PASS] %s\n' "$1"
}

for forbidden in .env secrets node_modules; do
  [[ ! -e "$forbidden" ]] || fail "Release contains forbidden local path: $forbidden"
done

for forbidden_file in data/run/offckb.pid data/run/inspector.pid data/logs/offckb-accounts.txt; do
  [[ ! -e "$forbidden_file" ]] || fail "Release contains forbidden runtime file: $forbidden_file"
done

for required in \
  screenshots/01-rust-contract-tests.png \
  screenshots/02-contract-deployment.png \
  screenshots/03-local-offckb-success.png \
  screenshots/04-automatic-end-to-end-success.png \
  screenshots/05-local-offckb-lifecycle-success.png \
  screenshots/06-final-revoked-cell.png \
  screenshots/07-v2.2-dashboard.png \
  screenshots/08-v2.2-learning-hub.png \
  screenshots/09-v2.3-learning-hub.png \
  screenshots/SECURITY_REVIEW.md \
  evidence/run-summary.json \
  evidence/local-offckb-run-sanitized.log \
  evidence/automatic-end-to-end-run-2026-07-22-sanitized.log \
  evidence/week-02-run-summary.json \
  reports/week-01-report.md \
  reports/week-02-report.md \
  data/offckb-chain-state.json \
  data/automatic-public-verification-proof.json \
  deployment/scripts.json \
  .env.example \
  .gitignore \
  docs/PUBLIC_INSPECTOR.md \
  docs/CREDENTIAL_CELL_DATA_FORMAT.md \
  community/decoder/credential-cell-decoder.js \
  community/test-vectors/credential-cell-v1.json \
  learning/progress.json \
  learning/catalog.json \
  learning/basic-exercises/README.md \
  learning/basic-exercises/transfer-ckb/EVIDENCE_TEMPLATE.md \
  learning/basic-exercises/store-data-on-cell/EVIDENCE_TEMPLATE.md \
  learning/basic-exercises/create-fungible-token/EVIDENCE_TEMPLATE.md \
  learning/basic-exercises/create-dob/EVIDENCE_TEMPLATE.md \
  learning/basic-exercises/build-simple-lock/EVIDENCE_TEMPLATE.md \
  learning/README.md \
  learning/cell-model/concepts.md \
  docs/SCREENSHOT_EVIDENCE_GUIDE.md \
  src/lib/basic-exercises.js \
  scripts/run-basic-exercises.js \
  public/screenshot-guide.html \
  V2.3_UPDATE_SUMMARY.md \
  HANDBOOK_PROGRESS.md \
  CONTRIBUTING.md \
  LICENSE; do
  [[ -f "$required" ]] || fail "Missing required file: $required"
done

if grep -RIE --exclude-dir=node_modules --exclude-dir=target --exclude='*.png' --exclude='audit-release.sh' --exclude='v2.1-ci-local.txt' \
  -- '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|(^|[^A-Za-z0-9_])(PRIVATE_KEY|CKB_PRIVATE_KEY|MNEMONIC|SEED_PHRASE)[[:space:]]*=[[:space:]]*(0x[0-9a-fA-F]{64}|[A-Za-z0-9+/=_-]{24,})' .; then
  fail 'Potential private signing material was found.'
fi

if grep -RIE --exclude-dir=node_modules --exclude-dir=target --exclude='*.png' --exclude='audit-release.sh' --exclude='v2.1-ci-local.txt' \
  -- '/mnt/c/Users/[A-Za-z0-9._-]+|C:\\Users\\[A-Za-z0-9._-]+|/home/[A-Za-z0-9._-]+|[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:' screenshots evidence data deployment; then
  fail 'Unsanitized local username or absolute user path found in public evidence.'
fi

python3 -m json.tool evidence/run-summary.json >/dev/null
python3 -m json.tool evidence/week-02-run-summary.json >/dev/null
python3 -m json.tool data/offckb-chain-state.json >/dev/null
python3 -m json.tool data/automatic-public-verification-proof.json >/dev/null
python3 -m json.tool deployment/scripts.json >/dev/null
python3 -m json.tool community/test-vectors/credential-cell-v1.json >/dev/null
python3 -m json.tool learning/progress.json >/dev/null
python3 -m json.tool learning/catalog.json >/dev/null
node scripts/verify-test-vectors.js >/dev/null
node scripts/check-learning.js >/dev/null
node scripts/run-basic-exercises.js >/dev/null

pass 'No generated .env, secrets directory, private account listing, or stale PID file is present.'
pass 'No unapproved private-key, seed-phrase, or mnemonic assignment pattern was found.'
pass 'Public evidence paths and usernames are sanitized.'
pass 'Reports, screenshots, logs, and machine-readable evidence are present.'
pass 'Evidence and community test-vector JSON files are valid.'
pass 'Release audit completed successfully.'
