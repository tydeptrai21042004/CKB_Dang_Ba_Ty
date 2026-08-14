#!/usr/bin/env bash
set -Eeuo pipefail

# CKBuilder v10 - environment checker + one-command launcher
# Put this file in the CKBuilder project root and run:
#   chmod +x check-env-and-run-all.sh
#   ./check-env-and-run-all.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR"

# Also support running the downloaded helper next to an extracted CKBuilder-main/.
if [[ ! -f "$ROOT/package.json" || ! -f "$ROOT/run-full-project.sh" ]]; then
  if [[ -f "$SCRIPT_DIR/CKBuilder-main/package.json" && -f "$SCRIPT_DIR/CKBuilder-main/run-full-project.sh" ]]; then
    ROOT="$SCRIPT_DIR/CKBuilder-main"
  else
    printf '[ERROR] CKBuilder project root was not found.\n' >&2
    printf '        Put this script inside CKBuilder-main/ and run it again.\n' >&2
    exit 1
  fi
fi
cd "$ROOT"

MODE="full"
RUN_CI=1
FOREGROUND=0
INSTALL_MISSING=1
AUTO_CREATE_ENV=1

info() { printf '\n\033[1;34m[INFO]\033[0m %s\n' "$*"; }
pass() { printf '\033[1;32m[PASS]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[WARN]\033[0m %s\n' "$*" >&2; }
fail() { printf '\n\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
CKBuilder v10 environment checker + launcher

Usage:
  ./check-env-and-run-all.sh [options]

Default:
  1. Check the project/release files.
  2. Create .env from .env.example when missing.
  3. Repair executable bits on project shell scripts.
  4. Check local environment values and obvious unsafe placeholders.
  5. Run the complete local OffCKB/contract/application launcher.
  6. Run the full runtime CI/regression suite (release audit excluded while the app is live).
  7. Verify service health and print useful URLs/log paths.

Options:
  --check-only   Only inspect the environment; do not start/install anything.
  --fast         Reuse an existing successful OffCKB deployment.
  --skip-ci      Start the full project but skip the final npm run ci:runtime.
  --foreground   Keep the public inspector log attached after setup.
  --no-install   Do not let the underlying launcher install missing tools.
  --no-env-create
                 Fail instead of creating .env from .env.example.
  --status       Show CKBuilder service status only.
  --stop         Stop services managed by CKBuilder.
  -h, --help     Show this help.

Examples:
  ./check-env-and-run-all.sh
  ./check-env-and-run-all.sh --fast
  ./check-env-and-run-all.sh --check-only
  ./check-env-and-run-all.sh --status
  ./check-env-and-run-all.sh --stop
EOF
}

while (($#)); do
  case "$1" in
    --check-only) MODE="check" ;;
    --fast) MODE="fast" ;;
    --skip-ci) RUN_CI=0 ;;
    --foreground) FOREGROUND=1 ;;
    --no-install) INSTALL_MISSING=0 ;;
    --no-env-create) AUTO_CREATE_ENV=0 ;;
    --status) MODE="status" ;;
    --stop) MODE="stop" ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1 (use --help)" ;;
  esac
  shift
done

on_error() {
  local rc=$?
  printf '\n\033[1;31m[FAILED]\033[0m command failed (exit %s) at line %s:\n  %s\n' \
    "$rc" "${BASH_LINENO[0]:-?}" "${BASH_COMMAND:-unknown}" >&2
  printf '\nUseful diagnostics:\n' >&2
  printf '  bash run-full-project.sh --status\n' >&2
  printf '  tail -n 120 data/logs/public-inspector.log 2>/dev/null\n' >&2
  printf '  tail -n 120 data/logs/offckb-node.log 2>/dev/null\n' >&2
  exit "$rc"
}
trap on_error ERR

# Read KEY=value without sourcing arbitrary shell from .env.
read_env_value() {
  local key="$1" file="${2:-$ROOT/.env}"
  [[ -f "$file" ]] || return 0
  awk -v wanted="$key" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      line=$0
      sub(/^[[:space:]]*/, "", line)
      pos=index(line, "=")
      if (pos < 2) next
      k=substr(line, 1, pos-1)
      gsub(/[[:space:]]/, "", k)
      if (k != wanted) next
      v=substr(line, pos+1)
      sub(/^[[:space:]]*/, "", v)
      sub(/[[:space:]]*$/, "", v)
      if ((substr(v,1,1) == "\"" && substr(v,length(v),1) == "\"") ||
          (substr(v,1,1) == "\047" && substr(v,length(v),1) == "\047")) {
        v=substr(v,2,length(v)-2)
      }
      print v
      exit
    }
  ' "$file"
}

is_loopback_url() {
  [[ "$1" =~ ^http://(127\.0\.0\.1|localhost)(:[0-9]+)?(/.*)?$ ]]
}

check_required_release_files() {
  local required=(
    package.json package-lock.json
    .env.example .env.public.example .env.issuer.example
    .gitignore .dockerignore
    run-full-project.sh stop-full-project.sh
    scripts/check-env.sh scripts/setup-and-run-full.sh
  )
  local missing=() f
  for f in "${required[@]}"; do
    [[ -e "$f" ]] || missing+=("$f")
  done
  ((${#missing[@]} == 0)) || fail "Missing required project files: ${missing[*]}"
  pass "Required CKBuilder release files are present."
}

check_or_create_env() {
  if [[ -f .env ]]; then
    pass ".env exists."
    return
  fi

  if [[ "$MODE" == "check" || "$AUTO_CREATE_ENV" == "0" ]]; then
    fail ".env is missing. Create it with: cp .env.example .env"
  fi

  cp .env.example .env
  chmod 600 .env 2>/dev/null || true
  pass "Created .env from .env.example."
}

repair_shell_permissions() {
  [[ "$MODE" == "check" ]] && return 0
  chmod +x run-full-project.sh stop-full-project.sh 2>/dev/null || true
  if [[ -d scripts ]]; then
    find scripts -maxdepth 1 -type f -name '*.sh' -exec chmod +x {} + 2>/dev/null || true
  fi
  pass "Shell-script executable permissions are ready."
}

check_platform() {
  local os
  os="$(uname -s 2>/dev/null || echo unknown)"
  case "$os" in
    Linux|Darwin) pass "Supported shell platform detected: $os." ;;
    MINGW*|MSYS*|CYGWIN*)
      fail "Use WSL2 instead of Git Bash/Cygwin for the complete OffCKB/RISC-V workflow."
      ;;
    *) warn "Untested platform: $os. Linux/WSL2 or macOS is recommended." ;;
  esac

  if grep -qi microsoft /proc/version 2>/dev/null; then
    pass "WSL environment detected."
  fi
}

check_basic_tools() {
  local tools=(bash awk sed grep find)
  local missing=() t
  for t in "${tools[@]}"; do command -v "$t" >/dev/null 2>&1 || missing+=("$t"); done
  ((${#missing[@]} == 0)) || fail "Missing basic shell tools: ${missing[*]}"
  pass "Basic shell tools are available."

  for t in curl git unzip node npm; do
    if command -v "$t" >/dev/null 2>&1; then
      case "$t" in
        node) pass "Node.js $(node --version) detected." ;;
        npm) pass "npm $(npm --version) detected." ;;
        *) pass "$t detected." ;;
      esac
    elif [[ "$MODE" == "check" || "$INSTALL_MISSING" == "0" ]]; then
      warn "$t is missing. Full launch requires it."
    else
      warn "$t is missing; run-full-project.sh will attempt to install it."
    fi
  done

  if command -v node >/dev/null 2>&1; then
    if node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; then
      pass "Node.js version satisfies the project requirement (22+)."
    elif [[ "$MODE" == "check" || "$INSTALL_MISSING" == "0" ]]; then
      warn "Node.js 22+ is required by package.json; current version is $(node --version)."
    else
      warn "Node.js is older than 22; the launcher must install/use Node 22+ before CKBuilder can run."
    fi
  fi
}

check_env_shape() {
  local network rpc require_rpc ai_enabled fiber_url session_secret admin_password
  network="$(read_env_value APP_NETWORK)"
  rpc="$(read_env_value CKB_RPC_URL)"
  require_rpc="$(read_env_value REQUIRE_CKB_RPC)"
  ai_enabled="$(read_env_value AI_ENABLED)"
  fiber_url="$(read_env_value FIBER_RPC_URL)"
  session_secret="$(read_env_value SESSION_SECRET)"
  admin_password="$(read_env_value ADMIN_PASSWORD)"

  printf '\nEnvironment summary\n'
  printf '  %-22s %s\n' 'APP_NETWORK' "${network:-<unset>}"
  printf '  %-22s %s\n' 'CKB_RPC_URL' "${rpc:-<unset>}"
  printf '  %-22s %s\n' 'REQUIRE_CKB_RPC' "${require_rpc:-<unset>}"
  printf '  %-22s %s\n' 'AI_ENABLED' "${ai_enabled:-<unset>}"
  printf '  %-22s %s\n' 'FIBER_RPC_URL' "${fiber_url:-<disabled>}"

  [[ -n "$network" ]] || warn "APP_NETWORK is unset."
  [[ -n "$rpc" ]] || warn "CKB_RPC_URL is unset."

  if [[ "$network" == "mainnet" || "$network" == "testnet" ]]; then
    warn "APP_NETWORK=$network. The automatic full launcher intentionally switches to local devnet and will not use public-chain signing."
  fi

  if [[ -n "$session_secret" ]]; then
    if [[ ${#session_secret} -lt 32 || "$session_secret" == replace-* || "$session_secret" == *change-me* ]]; then
      warn "SESSION_SECRET is a placeholder/too short. Fine for an isolated demo, NOT for production."
    else
      pass "SESSION_SECRET length looks production-capable."
    fi
  fi

  if [[ -n "$admin_password" && ( "$admin_password" == replace-* || "$admin_password" == change-* || "$admin_password" == *example* ) ]]; then
    warn "ADMIN_PASSWORD is still an example value. Change it before any non-local deployment."
  fi

  if [[ -n "$fiber_url" ]] && ! is_loopback_url "$fiber_url"; then
    warn "FIBER_RPC_URL is remote. Verify that this endpoint is trusted before enabling payment workflows."
  fi
}

check_node_env_if_possible() {
  if ! command -v node >/dev/null 2>&1; then
    warn "Skipping application-level env parser until Node.js is available."
    return 0
  fi

  if node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)' >/dev/null 2>&1; then
    if bash scripts/check-env.sh; then
      pass "Application-level environment validation passed."
    else
      if [[ "$MODE" == "check" ]]; then
        return 1
      fi
      warn "Initial env validation did not pass yet. The full local launcher can repair/start its local OffCKB environment; validation will be repeated afterward."
    fi
  fi
}

show_final_summary() {
  printf '\n============================================================\n'
  printf ' CKBuilder v10 is ready\n'
  printf '============================================================\n'
  printf ' Project root:      %s\n' "$ROOT"
  printf ' Public inspector:  http://127.0.0.1:4173\n'
  printf ' Status:            bash run-full-project.sh --status\n'
  printf ' Stop:              bash run-full-project.sh --stop\n'
  printf ' Inspector log:     data/logs/public-inspector.log\n'
  printf ' OffCKB log:        data/logs/offckb-node.log\n'
  printf ' Launch summary:    data/run/launch-summary.json\n'
  printf '============================================================\n'
}

info "CKBuilder v10 preflight"
check_required_release_files
check_platform
check_or_create_env
repair_shell_permissions
check_basic_tools
check_env_shape
check_node_env_if_possible

case "$MODE" in
  check)
    pass "Check-only preflight completed. No CKBuilder services were started."
    exit 0
    ;;
  status)
    exec bash run-full-project.sh --status
    ;;
  stop)
    exec bash run-full-project.sh --stop
    ;;
esac

info "Starting the complete CKBuilder local stack"
launcher_args=()
[[ "$MODE" == "fast" ]] && launcher_args+=(--fast)
[[ "$FOREGROUND" == "1" ]] && launcher_args+=(--foreground)
[[ "$INSTALL_MISSING" == "0" ]] && launcher_args+=(--no-install)

bash run-full-project.sh "${launcher_args[@]}"

# The launcher writes safe local devnet/RPC values. Validate the final effective env.
info "Rechecking the effective environment after startup"
bash scripts/check-env.sh
pass "Final environment validation passed."

if [[ "$RUN_CI" == "1" ]]; then
  info "Running CKBuilder runtime CI/regression suite"
  command -v npm >/dev/null 2>&1 || fail "npm is unavailable after startup."
  npm run ci:runtime
  pass "Runtime CI/regression suite passed."
  info "Release audit intentionally skipped in the live runtime tree (.env, secrets/, node_modules/, and PID/state files are expected here)."
else
  warn "Final CI was skipped because --skip-ci was supplied."
fi

info "Checking running-service status"
bash run-full-project.sh --status

if command -v curl >/dev/null 2>&1; then
  if bash scripts/check-inspector-health.sh "http://127.0.0.1:4173/api/health" >/dev/null 2>&1; then
    pass "Public inspector health check passed."
  else
    warn "Inspector health endpoint did not answer at the default URL. Check status/logs above."
  fi
fi

show_final_summary
