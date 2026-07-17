#!/bin/bash

  set -Eeuo pipefail

  # =====================================
  # CONCURRENT DEPLOY GUARD
  # =====================================
  # Serialize concurrent GitHub Actions runs so two deploys can't run
  # simultaneously and create conflicting Docker containers.
  DEPLOY_LOCK="/tmp/smit-csc-deploy.lock"
  exec 9>"$DEPLOY_LOCK"
  if ! flock -w 180 9; then
    echo "[ERROR] Could not acquire deploy lock after 3 min — another deploy is running"
    exit 1
  fi
  echo "[DEPLOY] Lock acquired — starting deployment"

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
  # ENSURE DOCKER AUTO-STARTS ON REBOOT
  # =====================================
  # Prevents 502 Bad Gateway after VM reboots — Docker daemon must be
  # enabled as a systemd service or containers won't start back up.
  sudo systemctl enable docker 2>/dev/null || true
  sudo systemctl start  docker 2>/dev/null || true

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
  sleep 3

  # Force-remove named service containers so Docker always creates fresh ones.
  # Without this, compose up tries to Restart a container still in "marked for
  # removal" transitional state, causing ERR: container cannot be started.
  for cname in smit_csc_db smit_csc_api smit_csc_frontend smit_csc_migrate; do
    docker rm -f "$cname" 2>/dev/null || true
  done
  docker network rm smit-csc-info_csc_network 2>/dev/null || true
  sleep 2

  log "Ensuring proxy-net Docker network exists..."
  docker network create proxy-net 2>/dev/null || true

  log "Starting containers..."
  $COMPOSE up -d --remove-orphans --force-recreate

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

  # =====================================
    # =====================================
    # =====================================
    # =====================================
    # SSL: CERTBOT CERTONLY + MANUAL NGINX CONFIG
    # =====================================
    # Use certbot certonly (--standalone or --webroot) to get/renew the cert
    # WITHOUT letting certbot touch the nginx config.  We write the nginx SSL
    # blocks ourselves so the configuration is always correct and predictable.
    log "Configuring SSL..."
      if command -v certbot >/dev/null 2>&1; then
        sudo rm -f /var/log/letsencrypt/.certbot.lock 2>/dev/null || true

        # Renew (or obtain) the cert using the nginx authenticator.
        # --nginx here is just for HTTP-01 challenge serving, NOT config management.
        sudo certbot certonly \
          --nginx \
          -d smitcscinfo.com \
          -d www.smitcscinfo.com \
          --non-interactive \
          --agree-tos \
          -m smitcscinfoyt@gmail.com \
          --quiet 2>&1 && log "certbot: cert obtained/renewed" || warn "certbot certonly failed; will try with existing cert"

        # Ensure nginx (www-data) can read cert files at runtime.
        # certbot creates privkey*.pem with mode 600 (root-only). nginx -t
        # passes (syntax check only) but serving HTTPS fails with SSL alert 80.
        sudo chmod 755 /etc/letsencrypt/live/ /etc/letsencrypt/archive/ 2>/dev/null || true
        sudo chmod 755 /etc/letsencrypt/live/smitcscinfo.com/ /etc/letsencrypt/archive/smitcscinfo.com/ 2>/dev/null || true
        sudo chmod 644 /etc/letsencrypt/archive/smitcscinfo.com/*.pem 2>/dev/null || true

        # Diagnose cert status so failures are visible in deploy logs
        sudo certbot certificates 2>&1 | grep -E "Certificate Name|Expiry|Domains|VALID|EXPIRED|INVALID" || true

        CERT_PATH="/etc/letsencrypt/live/smitcscinfo.com/fullchain.pem"
        KEY_PATH="/etc/letsencrypt/live/smitcscinfo.com/privkey.pem"

        if sudo test -f "$CERT_PATH" && sudo test -f "$KEY_PATH"; then
          # Write the desired config to a temp file first so we can detect
          # whether it actually changed before touching a running nginx.
          NGINX_CONF_TARGET="/etc/nginx/sites-available/smit-csc-info"
          NGINX_CONF_NEW="/tmp/smit-csc-info-nginx-new.conf"
          cat > "$NGINX_CONF_NEW" << 'NGINX_SSL'
# Managed by deploy.sh — do not edit manually
server {
    listen 80;
    server_name smitcscinfo.com www.smitcscinfo.com;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://$host$request_uri; }
}
server {
    listen 443 ssl;
    server_name smitcscinfo.com www.smitcscinfo.com;
    ssl_certificate     /etc/letsencrypt/live/smitcscinfo.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/smitcscinfo.com/privkey.pem;
    ssl_protocols TLSv1.2;
    ssl_prefer_server_ciphers off;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_SSL

          # Only touch nginx if the config actually changed OR nginx isn't
          # currently serving HTTPS correctly. This is the key fix for
          # intermittent SSL errors: previously we stopped+killed+restarted
          # nginx on EVERY deploy, causing a real (few-second) outage window
          # on every single push. Most deploys don't change SSL/nginx config
          # at all, so nginx should just be left running untouched.
          CONFIG_CHANGED=1
          if sudo test -f "$NGINX_CONF_TARGET" && sudo diff -q "$NGINX_CONF_TARGET" "$NGINX_CONF_NEW" >/dev/null 2>&1; then
            CONFIG_CHANGED=0
          fi

          NGINX_CURRENTLY_HEALTHY=0
          if sudo systemctl is-active --quiet nginx 2>/dev/null && \
             echo | timeout 3 openssl s_client -connect 127.0.0.1:443 -servername smitcscinfo.com 2>/dev/null | grep -q "Verify return code: 0"; then
            NGINX_CURRENTLY_HEALTHY=1
          fi

          if [ "$CONFIG_CHANGED" -eq 0 ] && [ "$NGINX_CURRENTLY_HEALTHY" -eq 1 ]; then
            log "nginx config unchanged and HTTPS already healthy — skipping nginx restart (no downtime)"
          else
            sudo cp "$NGINX_CONF_NEW" "$NGINX_CONF_TARGET"
            sudo ln -sf "$NGINX_CONF_TARGET" /etc/nginx/sites-enabled/smit-csc-info
            # Remove default nginx site — it may have a broken SSL block from a prior certbot run
            # that intercepts port 443 before our smit-csc-info vhost
            sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

            if sudo nginx -t 2>&1; then
              if [ "$NGINX_CURRENTLY_HEALTHY" -eq 1 ]; then
                # Config changed but nginx is already healthy — reload is graceful
                # (finishes in-flight requests, never drops connections) unlike
                # stop+start which has a real downtime window.
                log "Config changed — reloading nginx gracefully (no downtime)"
                sudo systemctl reload nginx 2>/dev/null || true
              else
                # nginx isn't healthy right now (e.g. not running, or an orphan
                # certbot-spawned nginx process is holding the port) — only in
                # this recovery case do we do the more disruptive full restart.
                warn "nginx not currently healthy — doing full restart to recover"
                sudo systemctl stop nginx 2>/dev/null || true
                sudo pkill -x nginx 2>/dev/null || true
                sleep 2
                sudo systemctl start nginx 2>/dev/null || sudo nginx 2>/dev/null || true
              fi
              log "SSL configured and nginx is up to date"
              sudo tail -5 /var/log/nginx/error.log 2>/dev/null || true
            else
              warn "nginx -t FAILED after writing SSL config — reverting to HTTP-only"
              sudo tail -5 /var/log/nginx/error.log 2>/dev/null || true
              sudo cp "$APP_DIR/system-nginx.conf" /etc/nginx/sites-available/smit-csc-info
              sudo systemctl reload nginx 2>/dev/null || sudo systemctl restart nginx 2>/dev/null || true
            fi
          fi
          rm -f "$NGINX_CONF_NEW"
        else
          warn "cert files not found at $CERT_PATH — keeping HTTP-only nginx config"
        fi
      else
        warn "certbot not found — skipping SSL"
      fi

    # ========== PORT 443 DIAGNOSTICS ==========
  log "=== What is listening on port 443? ==="
  sudo ss -tlnp 2>/dev/null | grep ":443" || echo "NOTHING on 443"
  log "=== Is system nginx running? ==="
  sudo systemctl is-active nginx 2>/dev/null || echo "nginx service: inactive"
  sudo systemctl status nginx --no-pager -l 2>/dev/null | head -20 || true
  log "=== nginx config in sites-enabled ==="
  sudo cat /etc/nginx/sites-enabled/smit-csc-info 2>/dev/null | head -30 || echo "config not found"
  log "=== nginx error log (last 10 lines) ==="
  sudo tail -10 /var/log/nginx/error.log 2>/dev/null || true
  log "=== iptables NAT rules for 443 ==="
  sudo iptables -t nat -L -n 2>/dev/null | grep -E "443|REDIRECT|DNAT" || echo "No NAT rules for 443"
  log "=== All processes on port 443 ==="
  sudo fuser 443/tcp 2>/dev/null || echo "fuser: nothing on 443/tcp"
  log "=== SSL cert file check ==="
  sudo openssl x509 -in /etc/letsencrypt/live/smitcscinfo.com/fullchain.pem -noout -dates 2>/dev/null || echo "CERT READ FAILED"
  sudo openssl rsa -in /etc/letsencrypt/live/smitcscinfo.com/privkey.pem -noout -check 2>/dev/null || echo "KEY READ FAILED"
  log "=== ALL docker containers (incl. external proxy-net stack) ==="
  sudo docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
  log "=== proxy-net network inspect ==="
  sudo docker network inspect proxy-net 2>/dev/null | grep -E "Name|IPv4Address" || echo "proxy-net inspect failed"
  log "=== Full iptables NAT PREROUTING chain ==="
  sudo iptables -t nat -L PREROUTING -n --line-numbers 2>/dev/null || true
  log "=== Full iptables NAT DOCKER chain ==="
  sudo iptables -t nat -L DOCKER -n --line-numbers 2>/dev/null || true
  log "=== openssl version on VM ==="
  openssl version -a 2>/dev/null | head -5 || true
  log "=== LOCAL SSL handshake test (from VM itself, bypasses network/firewall) ==="
  echo | timeout 5 openssl s_client -connect localhost:443 -servername smitcscinfo.com 2>&1 | grep -E "subject|issuer|Cipher|error|alert|Verify|BEGIN CERT" || echo "local handshake test produced no output"
  log "=== LOCAL curl test (from VM itself) ==="
  curl -skv https://localhost/ --resolve smitcscinfo.com:443:127.0.0.1 -H "Host: smitcscinfo.com" --max-time 5 2>&1 | grep -E "SSL|TLS|error|HTTP" | head -15 || true
  log "=== Check for broken OpenSSL engine/fips config ==="
  grep -iE "engine|fips" /etc/ssl/openssl.cnf 2>/dev/null | head -10 || echo "no engine/fips directives found"
  log "=== VM public IP (as seen from outside) ==="
  curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "ifconfig.me check failed"
  echo ""
  log "=== VM private/public network interfaces ==="
  ip -4 addr show scope global 2>/dev/null | grep inet || true
  log "=== iptables INPUT chain (host firewall, not Docker NAT) ==="
  sudo iptables -L INPUT -n -v --line-numbers 2>/dev/null | head -25 || true
  log "=== ufw status ==="
  sudo ufw status verbose 2>/dev/null || echo "ufw not active/installed"
  log "=== firewalld status ==="
  sudo firewall-cmd --list-all 2>/dev/null || echo "firewalld not active/installed"
  log "=== Does VM public IP match smitcscinfo.com DNS record? (safe boolean check, no IP leaked) ==="
  MY_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "unknown")
  DNS_IP=$(getent hosts smitcscinfo.com 2>/dev/null | awk '{print $1}' | head -1 || echo "unknown")
  if [ "$MY_IP" = "$DNS_IP" ] && [ "$MY_IP" != "unknown" ]; then
    log "MATCH: smitcscinfo.com DNS points directly to this VM (no load balancer/proxy in front)"
  else
    warn "NO MATCH: smitcscinfo.com DNS does NOT point to this VM! Traffic is routed through something else (load balancer, CDN, or proxy) before reaching this server."
  fi
  log "=== TLS record inspection: raw bytes received on a local vs external simulated connection ==="
  echo | timeout 3 openssl s_client -connect 127.0.0.1:443 -servername smitcscinfo.com 2>&1 | grep -c "BEGIN CERTIFICATE" || true
  
  log "=== certbot renewal timer/cron (possible source of intermittent SSL breakage) ==="
  systemctl list-timers 2>/dev/null | grep -i certbot || echo "no certbot systemd timer found"
  sudo systemctl status certbot.timer --no-pager 2>/dev/null || echo "certbot.timer not found"
  crontab -l 2>/dev/null | grep -i certbot || echo "no certbot cron entries for current user"
  sudo crontab -l 2>/dev/null | grep -i certbot || echo "no certbot cron entries for root"
  ls /etc/cron.d/ 2>/dev/null | grep -i certbot || echo "no /etc/cron.d certbot entry"
  log "=== nginx process info (checking for crashes/multiple masters) ==="
  ps -eo pid,ppid,etimes,cmd | grep "[n]ginx" || echo "no nginx processes found"
  log "=== nginx systemd service status and recent restarts ==="
  sudo systemctl status nginx --no-pager 2>/dev/null | head -15 || echo "nginx not managed by systemd"
  log "=== recent nginx-related journal entries (last 2 hours) ==="
  sudo journalctl -u nginx --since "2 hours ago" --no-pager 2>/dev/null | tail -40 || echo "no journal access"
  log "=== recent certbot renewal logs ==="
  sudo tail -n 40 /var/log/letsencrypt/letsencrypt.log 2>/dev/null || echo "no certbot log found"
  log "=== certbot renewal hooks (these run automatically and could restart/break nginx) ==="
  sudo ls -la /etc/letsencrypt/renewal-hooks/deploy/ 2>/dev/null || echo "no deploy hooks dir"
  sudo cat /etc/letsencrypt/renewal-hooks/deploy/*.sh 2>/dev/null || echo "no deploy hook scripts"
  sudo cat /etc/letsencrypt/renewal/smitcscinfo.com.conf 2>/dev/null | grep -A3 "\[renewalparams\]" || echo "no renewal conf found"
# ========== END DIAGNOSTICS ==========

  # =====================================
  # DNS HEALTH CHECK
  # =====================================
  # Fails the workflow loudly (but AFTER the app has already been deployed)
  # if smitcscinfo.com DNS ever stops pointing at this VM. Catches DNS drift
  # (wrong A record, accidental CDN/proxy enable, etc.) that would otherwise
  # cause a silent HTTPS outage nobody notices until a user reports it.
  DNS_CHECK_FAILED=0
  for HOSTNAME_TO_CHECK in smitcscinfo.com www.smitcscinfo.com; do
    MY_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "unknown")
    RESOLVED_IP=$(getent hosts "$HOSTNAME_TO_CHECK" 2>/dev/null | awk '{print $1}' | head -1 || echo "unknown")
    if [ "$MY_IP" = "unknown" ] || [ "$RESOLVED_IP" = "unknown" ]; then
      warn "Could not verify DNS for $HOSTNAME_TO_CHECK (lookup failed) - skipping this check"
      continue
    fi
    if [ "$MY_IP" != "$RESOLVED_IP" ]; then
      echo "::error::DNS DRIFT DETECTED: $HOSTNAME_TO_CHECK does NOT resolve to this server anymore. HTTPS/HTTP for this domain will be broken or served by the wrong host until DNS is fixed. Check your DNS provider A record for $HOSTNAME_TO_CHECK."
      error "DNS DRIFT: $HOSTNAME_TO_CHECK does not point to this VM"
      DNS_CHECK_FAILED=1
    else
      log "DNS OK: $HOSTNAME_TO_CHECK correctly points to this VM"
    fi
  done

  log "Deployment completed successfully"

  if [ "$DNS_CHECK_FAILED" -eq 1 ]; then
    error "App deployed successfully, but DNS health check FAILED - marking this workflow run as failed so it is visible. See ::error:: annotation above for details."
    exit 1
  fi
  