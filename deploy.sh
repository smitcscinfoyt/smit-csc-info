#!/bin/bash

set -Eeuo pipefail

# =====================================
# CONFIG
# =====================================
APP_DIR="/mnt/data/docker/apps/smit-csc-info"
BRANCH="main"

# =====================================
# COLORS
# =====================================
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[DEPLOY]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# =====================================
# ERROR HANDLER
# =====================================
trap 'error "Deployment failed on line $LINENO"' ERR

# =====================================
# CHECK APP DIRECTORY
# =====================================
if [ ! -d "$APP_DIR/.git" ]; then
    error "Git repository not found in $APP_DIR"
    exit 1
fi

cd "$APP_DIR"

# =====================================
# CHECK DOCKER COMPOSE
# =====================================
if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE="docker-compose"
else
    error "Docker Compose not installed"
    exit 1
fi

# =====================================
# SHOW CURRENT COMMIT
# =====================================
log "Current commit:"
git log --oneline -1 || true

# =====================================
# FETCH LATEST
# =====================================
log "Fetching latest code..."
git fetch origin

# =====================================
# DISCARD LOCAL CHANGES
# =====================================
warn "Discarding local changes..."

git reset --hard
git clean -fd

# =====================================
# CHECKOUT BRANCH
# =====================================
log "Switching to branch: $BRANCH"
git checkout "$BRANCH"

# =====================================
# REBASE/PULL
# =====================================
log "Pulling latest changes..."
git pull --rebase origin "$BRANCH"

# =====================================
# BUILD + START CONTAINERS
# =====================================
log "Building and starting containers..."

$COMPOSE up -d --build --remove-orphans

# =====================================
# CLEANUP
# =====================================
log "Cleaning old Docker images..."

docker image prune -af

# =====================================
# FINAL STATUS
# =====================================
log "Running containers:"
docker ps

log "Deployment completed successfully 🚀"