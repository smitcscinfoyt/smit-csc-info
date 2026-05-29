#!/bin/bash

  set -Eeuo pipefail

  # =====================================
  # CONFIG
  # =====================================
  APP_DIR="$HOME/smit-csc-info"
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

  rollback() {
      error "Deployment failed."
      warn "Keeping existing containers running."
      exit 1
  }

  trap rollback ERR

  # =====================================
  # CHECK APP DIRECTORY
  # =====================================
  if [ ! -d "$APP_DIR/.git" ]; then
      error "Git repository not found: $APP_DIR"
      exit 1
  fi

  cd "$APP_DIR"

  # =====================================
  # DOCKER COMPOSE DETECTION
  # =====================================
  if docker compose version >/dev/null 2>&1; then
      COMPOSE="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
      COMPOSE="docker-compose"
  else
      error "Docker Compose not found"
      exit 1
  fi

  # =====================================
  # FETCH LATEST CODE
  # =====================================
  log "Fetching latest code..."

  git fetch origin

  warn "Discarding local changes..."

  git reset --hard
  git clean -fd --exclude=.env

  log "Checking out $BRANCH"

  git checkout "$BRANCH"

  log "Pulling latest code..."

  git pull --rebase origin "$BRANCH"

  # =====================================
  # BUILD FIRST (IMPORTANT)
  # =====================================
  log "Building Docker images first..."

  $COMPOSE build

  log "Build successful."

  # =====================================
  # REMOVE STALE ONE-SHOT CONTAINERS
  # =====================================
  # The migrate container has restart: "no" so Docker leaves it stopped
  # after each run. On the next deploy, recreating it causes a name conflict.
  # We use a multi-layered force-removal to guarantee it's gone before
  # docker compose up tries to create a fresh one.
  log "Removing stale migrate container (if any)..."

  # 1. Politely stop via compose
  $COMPOSE stop migrate 2>/dev/null || true
  sleep 1

  # 2. Force-remove via compose
  $COMPOSE rm -sf migrate 2>/dev/null || true
  sleep 1

  # 3. Brute-force remove by both possible names (old auto-name + new explicit container_name)
  docker rm -f smit_csc_migrate 2>/dev/null || true
  docker rm -f smit-csc-info-migrate-1 2>/dev/null || true

  # 4. Sweep any container whose name contains "migrate" (catches renamed variants)
  for cid in $(docker ps -a --filter "name=migrate" --format "{{.ID}}" 2>/dev/null); do
      docker stop "$cid" 2>/dev/null || true
      docker rm -f "$cid" 2>/dev/null || true
  done

  # 5. Verification loop: wait until container is truly gone (up to 30s)
  waited=0
  while docker inspect smit_csc_migrate >/dev/null 2>&1 || docker inspect smit-csc-info-migrate-1 >/dev/null 2>&1; do
      if [ $waited -ge 30 ]; then
          echo "[WARN] Migrate container still present after 30s, forcing removal"
          docker kill smit_csc_migrate 2>/dev/null || true
          docker kill smit-csc-info-migrate-1 2>/dev/null || true
          docker rm -f smit_csc_migrate 2>/dev/null || true
          docker rm -f smit-csc-info-migrate-1 2>/dev/null || true
          break
      fi
      echo "[WARN] Waiting for migrate container removal... ${waited}s"
      sleep 2
      waited=$((waited + 2))
  done

  log "Stopping all containers to clear any stale Docker state..."
  $COMPOSE down --remove-orphans 2>&1 || true

  log "Starting containers..."
  $COMPOSE up -d --remove-orphans

  # =====================================
  # OPTIONAL HEALTH CHECK
  # =====================================
  # Example:
  # sleep 10
  # curl -f http://localhost:3000 || exit 1

  # =====================================
  # CLEANUP
  # =====================================
  log "Cleaning build cache..."

  docker builder prune -af || true
  docker image prune -f || true

  # =====================================
  # STATUS
  # =====================================
  log "Running containers:"
  docker ps

  log "Deployment completed successfully"
  