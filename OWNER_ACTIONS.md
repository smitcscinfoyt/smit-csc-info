# Owner Actions & Deployment Runbook — smitcscinfo.com

This document lists mandatory owner actions, environment variables, credential rotation procedures, and deployment instructions for the Phase 1 Security upgrade.

---

## ⚠️ MANDATORY BEFORE DEPLOY (Server Will Refuse to Boot Otherwise)

Commit 6 introduces strict production startup validation in `artifacts/api-server/src/index.ts`. If any of the following environment variables are missing, empty, or set to known default placeholders (`secure_db_password`, `dev-secret-change-me`, `CHANGE_ME`), **the API server process will throw an error and exit immediately on startup**.

### Required Server Environment Variables (in `/home/ubuntu/app/.env` or GitHub Secrets):

| Variable | Description | Generation / Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://csc_admin:<STRONG_PASSWORD>@db:5432/smit_csc` |
| `POSTGRES_PASSWORD` | Database password for `csc_admin` | Strong random password (e.g. `openssl rand -hex 24`) |
| `SESSION_SECRET` | Secret used for cookie sessions & JWT signing | `openssl rand -base64 32` |
| `JWT_SECRET` | Secret used for verification tokens | `openssl rand -base64 32` |

---

## 1. Database Password Rotation (Required)

The default repository password `secure_db_password` has been removed from `docker-compose.yml`, `.github/workflows/deploy.yml`, and `README.md`. You must rotate the PostgreSQL user password on your Oracle Cloud VM.

### Steps on the Oracle Cloud VM:
1. SSH into the server:
   ```bash
   ssh -i your-key.key ubuntu@<SERVER_IP>
   ```
2. Generate a strong new password:
   ```bash
   openssl rand -hex 24
   # Example output: e4c9a81b37f2d5e690a1b4c7382d91f0e5b7a3c891e2f3d4
   ```
3. Update the password inside the running PostgreSQL container:
   ```bash
   docker exec -it smit_csc_db psql -U csc_admin -d smit_csc -c "ALTER USER csc_admin WITH PASSWORD '<NEW_STRONG_PASSWORD>';"
   ```
4. Update the GitHub Repository Secrets:
   - Go to: **GitHub Repo → Settings → Secrets and variables → Actions**
   - Update / Add:
     - `ENV_DB_PASSWORD`: Set to `<NEW_STRONG_PASSWORD>`
     - `ENV_DATABASE_URL`: Set to `postgresql://csc_admin:<NEW_STRONG_PASSWORD>@db:5432/smit_csc`
     - `ENV_SESSION_SECRET`: Set to generated 32-byte secret (`openssl rand -base64 32`)
     - `ENV_JWT_SECRET`: Set to generated 32-byte secret (`openssl rand -base64 32`)
5. Update `/home/ubuntu/app/.env` on the host with the new values.

---

## 2. KYC Document Backup & Storage Migration (Required Before Frontend Redeploy)

In Commit 1, the read-only static volume mount `./attached_assets:/usr/share/nginx/html/attached_assets:ro` was removed from the frontend Nginx container to stop public, unauthenticated access to private KYC files.

All KYC files are now served through the authenticated API route:
`GET /api/storage/objects/*path` (with strict user ownership & admin ACL verification).

### Backup Steps:
Before rebuilding the frontend container, ensure all uploaded assets currently stored in `./attached_assets` are backed up and accessible to the backend storage provider:
```bash
cd /home/ubuntu/app
# Create a timestamped archive of attached_assets
tar -czvf attached_assets_backup_$(date +%Y%m%d_%H%M%S).tar.gz ./attached_assets/

# If using Google Cloud Storage bucket or Replit Object Storage:
# Ensure files under ./attached_assets/ are synced to your object storage bucket
# gsutil -m rsync -r ./attached_assets/ gs://<YOUR_PRIVATE_BUCKET>/objects/
```

Existing database rows containing `/objects/...` URLs remain 100% backward-compatible.

---

## 3. Deployment Procedure & Order (Downtime: ~2 minutes)

Deploy during low-traffic hours (e.g., late evening).

### Deployment Steps:
1. Ensure all GitHub Secrets (`ENV_DB_PASSWORD`, `ENV_DATABASE_URL`, `ENV_SESSION_SECRET`, `ENV_JWT_SECRET`) are configured in GitHub.
2. Push or merge the upgrade branch to `main` (or run manual deployment via SSH):
   ```bash
   cd /home/ubuntu/app
   git fetch origin
   git checkout upgrade/seo-a11y-security
   ```
3. Verify your `.env` contains valid (non-default) values:
   ```bash
   grep -E "DATABASE_URL|SESSION_SECRET|JWT_SECRET|POSTGRES_PASSWORD" .env
   ```
4. Build and restart containers:
   ```bash
   docker compose down
   docker compose up -d --build
   ```
5. Check startup logs:
   ```bash
   docker compose logs api --tail=50
   ```
   Verify you see: `"Server listening"` and NO startup validation errors.
6. Verify containers are healthy:
   ```bash
   docker compose ps
   ```
   Both `smit_csc_api` and `smit_csc_frontend` should report `(healthy)`.

---

## 4. Payment Gateway Verification

- **PhonePe:**
  - S2S callbacks with invalid `X-VERIFY` signatures are now rejected with HTTP 401.
  - Constant-time string comparison (`crypto.timingSafeEqual`) is enforced on signature verification.
  - Server-side amount comparison verifies that PhonePe confirmed amount is greater than or equal to the plan cost in paise.
- **VyaparGateway:**
  - `crypto.timingSafeEqual` is verified on `X-VyaparGateway-Signature`.
  - Server-side amount checks in `reconcileVyaparTopup`, `reconcileVyaparOperatorMembership`, and `reconcileVyaparRecharge` prevent underpayment tampering.
- **Action for Owner:** If credentials were ever tested in development or logged to third-party tools, rotate `PHONEPE_CLIENT_SECRET` and `VYAPAR_WEBHOOK_SECRET` in their respective merchant portals.

---

## 5. Security & Regulatory Compliance Notes

### India Digital Personal Data Protection (DPDP) Act 2023:
- KYC documents (Aadhaar cards, PAN cards, selfies) must not be retained indefinitely.
- Store KYC documents only as long as necessary for regulatory requirements (typically 5 to 7 years from transaction/account closure).
- Ensure KYC records are permanently purged when an account is deleted upon user request.

### Firebase Web Client API Key:
- The Firebase API key (`AIzaSyBQ4pe8QuzgzD0B1pIux6morG6mevqVz6o`) found in `artifacts/smit-csc-info/src/lib/firebase.ts` is client-facing by Google design.
- **Owner Action:** In the [Google Cloud Console / Firebase Console](https://console.firebase.google.com/):
  - Go to **APIs & Services → Credentials → Browser key**.
  - Under **Application restrictions**, select **HTTP referrers (websites)** and restrict to:
    - `https://smitcscinfo.com/*`
    - `https://www.smitcscinfo.com/*`

### JWT Session Expiry & Invalidation:
- Currently, JWT tokens expire in 8 hours. Logout on the client clears `sessionStorage`.
- For immediate server-side revocation on logout or compromise, a token revocation list (Redis or PostgreSQL table) can be implemented in a future milestone.
