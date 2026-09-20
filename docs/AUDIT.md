# Phase 0 Comprehensive Technical Audit — smitcscinfo.com

**Date:** September 20, 2026  
**Auditor:** Senior Full-Stack, Technical SEO, WCAG Accessibility & AppSec Engineer  
**Branch:** `upgrade/seo-a11y-security`  
**Repository:** `smitcscinfoyt/smit-csc-info`  

---

## 1. Executive Summary

`smitcscinfo.com` is a production Gujarati-language digital services and government-scheme advisory portal catering to farmers, students, and Common Service Center (CSC) operators across Gujarat. The platform provides government scheme tutorials, YouTube-linked guides, client-side digital utilities (PDF Editor, ID Card Engine, Background Remover, Passport Photo Maker), a B2B2C mobile/DTH/utility recharge portal with wallet ledger, and user accounts with KYC document verification.

While functionally rich, the platform currently exhibits critical security vulnerabilities (public access to KYC object endpoints, exposed database and credentials in configuration, missing rate-limiting on auth endpoints, user enumeration), accessibility blockers (viewport pinch-zoom disabled, missing landmarks and lang tags), and technical SEO handicaps (pure client-side rendering delivering an empty shell `<div id="root"></div>` to search engine crawlers without metadata or structured data).

This document provides a thorough audit of the system architecture, codebases, and configurations as of Phase 0, establishing the baseline and blueprint for Phases 1–3.

---

## 2. Route Map & Application Architecture

The frontend is a single-page application (SPA) built with React 19, Vite, Tailwind CSS, Radix UI primitives, and `wouter` for routing.

### 2.1 Route Classification

| Route Pattern | Classification | Page Component | Access Control / Gating | Indexable (SEO) |
| :--- | :--- | :--- | :--- | :--- |
| `/` | Public Content | `Home` | Anonymous | Yes |
| `/content` | Public Content | `ContentList` | Anonymous | Yes |
| `/content/:id` | Public Content | `ContentDetail` | Anonymous (Prime locked for prime items) | Yes |
| `/membership` | Public Marketing | `Membership` | Anonymous | Yes |
| `/terms` | Public Legal | `Terms` | Anonymous | Yes |
| `/privacy` | Public Legal | `Privacy` | Anonymous | Yes |
| `/contact`, `/help`| Public Support | `Contact` | Anonymous | Yes |
| `/news/:id` | Public Content | `NewsReader` | Anonymous | Yes |
| `/documents` | Mixed Library | `Documents` | Anonymous / Prime filtered | Yes (Public items) |
| `/login` | App / Auth | `Login` | Anonymous (guest only) | No (`noindex`) |
| `/register` | App / Auth | `Register` | Anonymous (guest only) | No (`noindex`) |
| `/reset-password` | App / Auth | `ResetPassword` | Anonymous (guest only) | No (`noindex`) |
| `/reset-tpin` | App / Auth | `ResetTpin` | Anonymous (guest only) | No (`noindex`) |
| `/tools` | Tools Hub | `ToolsPage` | Anonymous | Yes |
| `/tools/pan-photo-resizer` | Utility Tool | `PanPhotoResizer` | Anonymous | Yes (Landing) |
| `/tools/signature-resizer` | Utility Tool | `SignatureResizer` | Anonymous | Yes (Landing) |
| `/tools/passport-photo-maker` | Utility Tool | `PassportPhotoMaker` | Anonymous | Yes (Landing) |
| `/tools/aadhaar-merger` | Utility Tool | `AadhaarMerger` | Anonymous | Yes (Landing) |
| `/tools/pdf-compressor` | Utility Tool | `PdfCompressor` | Anonymous | Yes (Landing) |
| `/tools/merge-pdf` | Utility Tool | `MergePdf` | Anonymous | Yes (Landing) |
| `/tools/jpg-to-pdf` | Utility Tool | `JpgToPdf` | Anonymous | Yes (Landing) |
| `/tools/background-remover` | Utility Tool | `BackgroundRemover` | Anonymous | Yes (Landing) |
| `/tools/dpi-converter` | Utility Tool | `DpiConverter` | Anonymous | Yes (Landing) |
| `/tools/image-compressor` | Utility Tool | `ImageCompressor` | Anonymous | Yes (Landing) |
| `/tools/image-upscaler` | Utility Tool | `ImageUpscaler` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/passport-engine` | Utility Tool | `PassportEngine` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/id-card-engine` | Utility Tool | `IdCardEngine` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/split-pdf` | Utility Tool | `SplitPdf` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/rotate-pdf` | Utility Tool | `RotatePdf` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/pdf-to-jpg` | Utility Tool | `PdfToJpg` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/esign-pdf` | Utility Tool | `EsignPdf` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/watermark-pdf` | Utility Tool | `WatermarkPdf` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/pdf-editor-v2` | Utility Tool | `PdfEditorV2` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/prime-studio` | Utility Tool | `PrimeStudioGate` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/delete-pages` | Utility Tool | `DeletePages` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/pdf-to-text` | Utility Tool | `PdfToText` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/lock-pdf` | Utility Tool | `LockPdf` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/unlock-pdf` | Utility Tool | `UnlockPdf` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/excel-to-pdf` | Utility Tool | `ExcelToPdf` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/pdf-to-word` | Utility Tool | `PdfToWord` | Anonymous / Prime download gate | Yes (Landing) |
| `/tools/word-to-pdf` | Utility Tool | `WordToPdf` | Anonymous / Prime download gate | Yes (Landing) |
| `/dashboard` | User Portal | `Dashboard` | Authenticated (Prime only) | No (`noindex`) |
| `/premium-dashboard` | User Portal | `PremiumDashboard` | Authenticated (Prime only) | No (`noindex`) |
| `/account`, `/profile` | User Portal | `Account` | Authenticated | No (`noindex`) |
| `/my-queries`, `/queries`| User Portal | `Account` | Authenticated | No (`noindex`) |
| `/wallet`, `/wallet/add` | Recharge Portal | `WalletPage`, `WalletAdd` | Authenticated | No (`noindex`) |
| `/recharge/*` (10 routes) | Recharge Portal | `RechargeHub`, etc. | Authenticated | No (`noindex`) |
| `/kyc` | User Portal | `KycPage` | Authenticated | No (`noindex`) |
| `/checkout/:scope/:planId`| Payment | `Checkout` | Authenticated | No (`noindex`) |
| `/payment/success`, `/pending`| Payment Callback | `PaymentSuccess`, etc. | Authenticated | No (`noindex`) |
| `/admin/*` (15 routes) | Admin Portal | `AdminDashboard`, etc. | Authenticated (`role: admin/manager`) | No (`noindex`) |

### 2.2 Frontend Routing & Bundling Critical Finding

In `artifacts/smit-csc-info/src/App.tsx`, **all 46 page components are imported statically at the top of the file**.
This includes enormous client-side libraries:
- `konva` and `react-konva` (Canvas manipulation for ID cards and PDF editor)
- `pdfjs-dist` and `pdf-lib` / `@cantoo/pdf-lib` (PDF parsing and generation)
- `@imgly/background-removal` (WASM + neural network model for background removal)
- `tesseract.js` (OCR engine)
- `onnxruntime-web` and `@tensorflow/tfjs`
- `jspdf`, `xlsx`, `docx`, `mammoth`

Because there is zero code-splitting (`React.lazy`), any user or search bot visiting the home page (`/`) or an article page (`/content/1`) downloads the entire bundle containing all tool libraries, degrading First Contentful Paint (FCP) and Total Blocking Time (TBT).

---

## 3. Article Content Storage & Serving

### 3.1 Data Model
Article content is stored in PostgreSQL under the `content` table (`lib/db/src/schema/content.ts`):
- `id` (serial primary key)
- `title` (text, not null)
- `titleGu` (text, Gujarati title)
- `category` (text, not null, e.g. "Khedut", "CSC Services", "Student")
- `type` (text, not null, e.g. "article", "video", "guide")
- `link` (text, not null, URL or YouTube video link)
- `description` (text, full markdown or article text)
- `isPrime` (boolean, indicates whether content requires Prime subscription)
- `thumbnailUrl` (text, image URL)
- `youtubeVideoId`, `playlistTitle`, `playlistId`, `publishedAt`, `createdAt`

### 3.2 Backend API Serving
- `GET /api/content`: Supports query parameters `category`, `type`, `isPrime`. Triggers automatic YouTube channel sync if table is empty.
- `GET /api/content/:id`: Returns single item. For Prime items requested by non-Prime users, fields `link` and `youtubeVideoId` are stripped.
- `GET /api/content/categories`: Aggregates category counts via SQL `GROUP BY`.

### 3.3 Frontend Consumption & SEO Deficiency
The client renders articles via `ContentDetail` (`artifacts/smit-csc-info/src/pages/content-detail.tsx`). Because rendering is 100% client-side:
1. Crawlers receive only the raw HTML shell with `<div id="root"></div>`.
2. Title is permanently static `<title>Smit CSC Info</title>` in `index.html`.
3. Open Graph (`og:title`, `og:image`, `og:description`) and Twitter cards are absent.
4. Structured Data (Schema.org `Article`, `VideoObject`, `BreadcrumbList`) is completely absent from the initial response.
5. Search engines unable or unwilling to execute dynamic JavaScript see no Gujarati text, headings, or content.

---

## 4. Current Nginx & Web Server Behavior

### 4.1 In-Container Nginx (`nginx.conf`)
- **SPA Fallback:** `try_files $uri $uri/ /index.html;`  
  *Issue:* Any URL—even `/content/does-not-exist` or `/random-path-404`—returns HTTP 200 with `index.html`. Crawlers detect this as a "Soft 404" which penalizes site domain rating.
- **Compression:** Standard `gzip on` is enabled for text types. Brotli is missing.
- **Caching:** No `Cache-Control` headers are configured for static hashed assets (`/assets/*.js`, `/assets/*.css`), resulting in revalidation overhead on repeat visits. No `no-cache` directive exists for `index.html`.
- **Static Assets:** `client_max_body_size 16M;` is configured.
- **Security Headers:** Missing entirely (`HSTS`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`, `Content-Security-Policy`).
- **File Exposure:** `./attached_assets` is mounted directly into `/usr/share/nginx/html/attached_assets:ro` in `docker-compose.yml`, exposing any uploaded asset directly over public HTTP.

### 4.2 Host Nginx (`system-nginx.conf`)
- Proxies `smitcscinfo.com` and `www.smitcscinfo.com` to `http://localhost:3000`.
- Certbot manages SSL redirects, but there is no canonical redirect enforcing a single domain (e.g. redirecting `www` to non-`www` or vice versa), causing duplicate content indexing issues.

---

## 5. Docker Infrastructure & Network Exposure

### 5.1 Service Topology (`docker-compose.yml`)
1. **`db` (PostgreSQL 16 Alpine):**
   - Healthcheck configured (`pg_isready`).
   - Internal network `csc_network`.
   - *Vulnerability:* In git history and current files, uses hardcoded credentials `POSTGRES_USER: csc_admin`, `POSTGRES_PASSWORD: secure_db_password`.
2. **`api` (Node.js Express 5):**
   - Port mapping: `ports: - "5000:5000"`.  
     *Vulnerability:* Maps port 5000 to `0.0.0.0:5000` on the host! Any external actor scanning the VM's public IP can bypass Nginx and access the API directly. Must bind to `127.0.0.1:5000:5000` or communicate purely over internal Docker network.
   - Volumes: `./attached_assets:/app/attached_assets`.
   - Runs as root inside `node:24-slim` container (no non-root user).
   - Missing Docker healthcheck.
3. **`frontend` (Nginx Alpine):**
   - Port mapping: `ports: - "3000:80"`. Maps to `0.0.0.0:3000`.
   - Volumes: `./attached_assets:/usr/share/nginx/html/attached_assets:ro`.
   - Missing Docker healthcheck.
4. **`migrate`:**
   - One-shot container running `pnpm --filter @workspace/db run push --force`.
   - Connects using hardcoded DB URL.

---

## 6. Authentication & Session Architecture

### 6.1 Token Mechanics
- Uses JSON Web Tokens (JWT) signed using `SESSION_SECRET` with an 8-hour expiry (`jwt.sign(payload, SECRET, { expiresIn: "8h" })`).
- Pending registrations use `PENDING_REG_SECRET` with fallback to `process.env.JWT_SECRET ?? "dev-secret-change-me"`.
- Token transmission: Sent in JSON body on login/registration/OAuth and stored in browser `sessionStorage.setItem("auth_token", token)`. Sent via `Authorization: Bearer <token>` header.
- *Deficiencies:*
  - Not stored in `HttpOnly`, `Secure`, `SameSite=Lax/Strict` cookies.
  - Vulnerable to XSS token theft if any script runs on the page.
  - `/api/auth/logout` is a no-op on the server (`res.json({ success: true })`); tokens remain valid until their 8-hour expiration if intercepted.

### 6.2 Password Security & Rate Limiting
- **Password Hashing:** Uses `bcrypt.hash(password, 10)` in `auth.ts` lines 66, 306, 354. Cost factor 10 is below the recommended threshold (cost ≥ 12 or argon2id).
- **Rate Limiting:** `/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`, `/api/auth/resend-verification` have **NO rate limiting**. An attacker can run credential-stuffing or brute-force dictionaries unrestricted.
- **Account Enumeration:**
  - Login returns `code: "invalid_password"` when the email exists, and `code: "invalid_email_and_password"` when the email does not exist.
  - Forgot password returns HTTP 404 `"This email is not registered with us."`
  - This allows attackers to enumerate registered users, phone numbers, and emails.

### 6.3 Logging & Data Sanitization
- `logger.ts` redacts only `req.headers.authorization`, `req.headers.cookie`, `res.headers['set-cookie']`.
- Passwords, OTPs, TPINs, Aadhaar numbers, PAN numbers, full names, and phone numbers logged in request bodies, query params, or error stack traces are NOT redacted.

---

## 7. Upload Handling & KYC Verification (Critical Risk)

### 7.1 Private KYC Document Access (IDOR / Unauthenticated Access)
- The KYC system (`/api/kyc`) requires users to upload:
  - PAN card image (`panImageUrl`)
  - Aadhaar card front image (`aadhaarFrontUrl`)
  - Aadhaar card back image (`aadhaarBackUrl`)
  - User live selfie (`selfieUrl`)
- Storage routing in `artifacts/api-server/src/routes/storage.ts`:
  - Line 135: `GET /storage/objects/*path` serves files from `PRIVATE_OBJECT_DIR`.
  - Lines 149–162: **The authentication and authorization check was commented out**:
    ```typescript
    // --- Protected route example (uncomment when using replit-auth) ---
    // if (!req.isAuthenticated()) { ... }
    ```
  - As a result, **any unauthenticated request to `/api/storage/objects/...` returns private documents** directly without verifying the requester identity or ownership.
  - Furthermore, `docker-compose.yml` mounts `./attached_assets` to `/usr/share/nginx/html/attached_assets:ro`, exposing files statically.

### 7.2 Upload Validation Weaknesses
- Upload presigning endpoint `/api/storage/uploads/request-url` validates only the MIME type string provided by the client in JSON (`ALLOWED_UPLOAD_CONTENT_TYPES.has(contentType)`).
- Magic bytes are not verified.
- EXIF and GPS geolocation metadata are not stripped from uploaded images.
- SVG script injection / polyglot files are not sanitized.

---

## 8. Payment & Recharge Architecture

### 8.1 Gateways
1. **PhonePe (Prime Membership):**
   - Webhook callback `/api/payments/phonepe/callback` checks v1 `x-verify` checksum. However, if checksum verification fails, the code logs a warning and proceeds to check status against the API.
   - Idempotency: Uses `merchantTransactionId` lookup and activates membership if status is "SUCCESS".
2. **VyaparGateway (UPI Topups & Recharges):**
   - Webhook `/api/webhook/vyapargateway` validates timestamp and HMAC SHA256 signature using `x-vyapargateway-signature`.
   - Polling endpoint `/api/vyapargateway/check-status`.
   - Reconciles topups and recharges using atomic database state checks `and(eq(table.id, id), eq(table.status, "pending"))` preventing double-spend race conditions.
3. **Wallet Engine:**
   - Database operations in `artifacts/api-server/src/lib/wallet-engine.ts` correctly use transactions and row-level locking (`FOR UPDATE`) with integer amounts in paise.
   - Unique database constraint `uqUserIdem` exists on `(userId, idempotencyKey)` in `rechargesTable`.

---

## 9. Baseline Accessibility & SEO Metrics

### 9.1 Accessibility (WCAG 2.2 Baseline)
- **Viewport Restrictions:** `index.html` has:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  ```
  This is a critical WCAG 1.4.4 (Resize Text) failure. Pinch-to-zoom is completely blocked on mobile devices.
- **Language Declaration:** `<html lang="en">` is hardcoded while the portal content is in Gujarati (`gu`). Screen readers pronounce Gujarati script using English phonetics.
- **Landmarks & Skip Link:** No "Skip to Content" link exists. Missing semantic landmarks (`<main>`, `<header>`, `<nav>`, `<footer>`) on several tool pages.
- **Touch Targets:** Several mobile action buttons, pagination items, and badge links have touch bounding boxes smaller than 44x44px.
- **Form Controls:** Missing explicit `<label>` associations or `aria-describedby` error bindings in multiple forms.

### 9.2 SEO & Rendering Baseline
- **Crawler Visibility:** Empty SPA container `<div id="root"></div>`. Dynamic fetch runs via client-side TanStack Query. Headless bots without JS execution index an empty page.
- **Meta Tags:** Static `<title>Smit CSC Info</title>` across every route. No dynamic description, canonical tags, or hreflang.
- **Status Codes:** Nginx returns HTTP 200 for all nonexistent URLs via `try_files ... /index.html`.
- **Crawlability Files:** Neither `robots.txt` nor `sitemap.xml` exists in `public/`.

---

## 10. Proposed Phase 1–3 Upgrade Strategy

### Execution Order: Security (Phase 1) → Accessibility (Phase 2) → SEO Rendering (Phase 3)

### Phase 1: Security Hardening
1. **Secrets:**
   - Scan working tree and all 317 git commits. Document findings in `OWNER_ACTIONS.md` with rotation instructions.
   - Replace default passwords/secrets in `docker-compose.yml`, `.env.example`, and `README.md` with `CHANGE_ME`.
   - Add server startup validation refusing to boot if secrets are missing or set to known defaults.
2. **Network & Docker:**
   - Bind API port to `127.0.0.1:5000:5000` or isolate behind internal Docker network.
   - Run containers as non-root users (`node` / `nginx`). Add Docker healthchecks.
3. **Uploads & KYC:**
   - Disable static exposure of `./attached_assets` in Nginx.
   - Enforce authentication and strict authorization/ownership check on `/api/storage/objects/*path`.
   - Implement magic byte verification, file size enforcement, EXIF stripping, and UUID storage.
4. **Auth & API Security:**
   - Upgrade bcrypt salt rounds to 12.
   - Add rate limiters to `/api/auth/login`, `/register`, `/forgot-password`, `/recharge`, `/storage/uploads`.
   - Prevent user enumeration by standardizing auth error messages.
   - Add `helmet` middleware, strict CORS origin allowlist, and redact sensitive fields in Pino logger.
5. **Nginx Security Headers:**
   - Add HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, X-Frame-Options, server_tokens off, and Report-Only CSP.

### Phase 2: Accessibility Upgrades
1. **Viewport:** Remove `maximum-scale=1.0` and `user-scalable=no`. Set base input font-size ≥ 16px to prevent iOS auto-zoom.
2. **HTML Semantics & Fonts:** Set `<html lang="gu">`, add "Skip to main content", ensure one `<h1>` per page, self-host readable Gujarati fonts (`Noto Sans Gujarati`).
3. **Keyboard & Focus:** Ensure all interactive elements have visible `:focus-visible` styling and logical tab orders.
4. **Touch & Motion:** Ensure ≥ 44x44px touch targets; respect `prefers-reduced-motion` across Framer Motion animations.
5. **Automated Testing:** Add `@axe-core/playwright` and `eslint-plugin-jsx-a11y` tests for core routes.

### Phase 3: Technical SEO & Rendering
1. **Fix Empty-Shell Problem:**
   - Implement build-time prerendering (SSG) / lightweight SSR for public content routes (Home, Category pages, Articles, Legal pages) so crawlers receive full Gujarati text, headings, and metadata without executing JS.
   - Keep private app routes and interactive tool canvases client-rendered with `noindex`.
2. **Dynamic Metadata & Structured Data:**
   - Add Gujarati title, description, canonical tags, Open Graph, and Twitter cards.
   - Embed JSON-LD: `Organization`, `WebSite`, `Article`, `BreadcrumbList`, and `VideoObject`.
3. **Real HTTP 404 Status:** Configure Nginx and prerender fallbacks so invalid URLs return true 404.
4. **Core Web Vitals & Code Splitting:**
   - Code-split all heavy tools (`pdf-editor-v2`, `id-card-engine`, `background-remover`, `passport-engine`) using `React.lazy` and dynamic imports.
   - Generate dynamic `sitemap.xml` and `robots.txt`.
