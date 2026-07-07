#!/bin/sh
set -e

log() {
  echo "[prepare-worktree-env] $*"
}

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
log "Worktree root: $ROOT"

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "nvm not found: $NVM_DIR/nvm.sh" >&2
  exit 1
fi

. "$NVM_DIR/nvm.sh"

NODE_VERSION="$(tr -d '[:space:]' < .nvmrc)"
log "Using Node from .nvmrc: $NODE_VERSION"
if ! nvm use --silent "$NODE_VERSION"; then
  log "Node $NODE_VERSION is not installed; installing with nvm"
  nvm install --no-progress "v${NODE_VERSION#v}"
  nvm use --silent "$NODE_VERSION"
fi
log "Node ready: $(node -v)"

if [ -L node_modules ]; then
  log "node_modules is a symlink; replacing it with a local install"
  rm node_modules
  NEEDS_INSTALL=1
elif [ ! -f node_modules/.modules.yaml ] || [ ! -x node_modules/.bin/vitest ]; then
  log "Dependencies are missing; installing from pnpm-lock.yaml"
  NEEDS_INSTALL=1
elif [ ! -f node_modules/.pnpm/lock.yaml ] || ! cmp -s pnpm-lock.yaml node_modules/.pnpm/lock.yaml; then
  log "Dependency lock snapshot is stale; refreshing install"
  NEEDS_INSTALL=1
fi

if [ "${NEEDS_INSTALL:-0}" = "1" ]; then
  log "Running pnpm install --frozen-lockfile"
  CI=true pnpm install --frozen-lockfile
  log "Dependencies ready"
else
  log "Environment already ready; no install needed"
fi
