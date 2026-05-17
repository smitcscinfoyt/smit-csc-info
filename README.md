# Smit CSC Info Monorepo

Smit CSC Info is a comprehensive, mobile-first digital portal designed for Gujarati farmers, students, and Common Service Center (CSC) operators. The platform empowers users with central access to government schemes, online services, legal documents, digital utilities (PDF Editor, Background Remover, Prime Studio), and a production-ready Recharge Portal.

---

## 📂 Project Folder Structure

The project is structured as a **pnpm monorepo** with two main folders for workspace packages: `artifacts/` (applications and servers) and `lib/` (shared packages and utilities).

```text
├── artifacts/                  # Applications & Services
│   ├── smit-csc-info/          # React + Vite frontend application
│   ├── api-server/             # Express 5 backend server
│   └── mockup-sandbox/         # Mockup environment / Sandbox
│
├── lib/                        # Shared Workspace Packages
│   ├── db/                     # Database schema, migrations, and Drizzle config
│   ├── api-spec/               # OpenAPI specifications for the backend
│   ├── api-zod/                # Shared Zod validation schemas
│   ├── api-client-react/       # Generated React Query hooks and custom fetch client
│   └── object-storage-web/     # Shared object storage browser utilities
│
├── scripts/                    # Shared utility scripts (e.g. Tesseract dependency copy)
├── attached_assets/            # Static assets and media files (mapped via Docker volumes)
│
├── package.json                # Monorepo root package.json
├── pnpm-workspace.yaml         # pnpm workspace configurations and package catalogs
├── tsconfig.json               # Root TypeScript configuration
└── tsconfig.base.json          # Shared TypeScript base configuration
```

---

## 🛠️ Tech Stack

### Frontend (`artifacts/smit-csc-info`)
- **Framework**: React 19 (via Vite)
- **Styling**: Tailwind CSS & Radix UI primitives
- **State Management & Data Fetching**: TanStack React Query, Zustand
- **Animations**: Framer Motion
- **Core Libraries**:
  - `Konva.js` & `react-konva` (for the Prime Studio Canva-like design tool)
  - `pdfjs-dist` & `@cantoo/pdf-lib` (for PDF Editing & rendering)
  - `@imgly/background-removal` & `Tesseract.js` (for browser-based background removal and OCR)

### Backend (`artifacts/api-server`)
- **Runtime**: Node.js
- **Framework**: Express 5
- **Database ORM**: Drizzle ORM with PostgreSQL (`pg` driver)
- **Validation**: Zod
- **Logging**: Pino & Pino-HTTP

---

## 🚀 Running & Deploying the Project

This section explains how to run the monorepo locally, orchestrate it using Docker Compose, or deploy it to a production Linux VM (e.g., Ubuntu/Debian/Arch Linux).

---

### 🛡️ 1. Security & Data Privacy (GitHub Check)
Before pushing to GitHub, verify that sensitive credentials and user-uploaded data are git-ignored:
- The **`.env`** file (which holds active passwords and API keys) is ignored by `.gitignore`.
- The **`attached_assets/`** folder (which houses all user-uploaded files, media, and KYC images) is ignored by `.gitignore` to prevent leaking private user documents.

---

### 💻 2. Local Development (Standard)

Ensure you have **Node.js** (v20+) and **pnpm** installed on your host.

#### Step 1: Install Dependencies
From the root directory, run:
```bash
pnpm install
```

#### Step 2: Configure Environment Variables
Copy `.env.example` to `.env` in the root:
```bash
cp .env.example .env
```
Open `.env` and fill in your database credentials and API keys.

#### Step 3: Run Database Schema Push
Apply your Drizzle schema to the database:
```bash
pnpm --filter @workspace/db run push
```

#### Step 4: Start Development Services
```bash
pnpm run dev
```
- **Backend API**: Runs at `http://localhost:5000`
- **Frontend App**: Runs at `http://localhost:3000`

---

### 🐳 3. VM Deployment & Orchestration (Docker Compose)

This is the **recommended** way to run the application on your VM. It spins up the Nginx frontend proxy, Express backend, and PostgreSQL database automatically.

#### Prerequisites on the VM
Make sure Docker and Docker Compose are installed:
```bash
# Ubuntu/Debian installation example:
sudo apt update
sudo apt install docker.io docker-compose-v2 -y
sudo systemctl enable --now docker
```

#### Step 1: Clone the Repository on the VM
```bash
git clone <your-github-repo-url>
cd Smit-CSC-Info
```

#### Step 2: Create the Environment File
Copy the example template and fill in your production credentials:
```bash
cp .env.example .env
nano .env
```

> [!NOTE]
> Make sure to leave `DATABASE_URL=postgresql://csc_admin:secure_db_password@localhost:5432/smit_csc` in `.env`.
> The backend container will automatically connect using the internal `db` host, but keeping `localhost` in `.env` allows you to run migrations from the VM host shell!

#### Step 3: Build & Launch the Containers
Launch the stack in detached background mode:
```bash
docker compose up -d --build
```
This will:
- Spin up **PostgreSQL** (`smit_csc_db`) and wait for it to become healthy.
- Build and boot the **Express API** (`smit_csc_api`).
- Build and boot **Nginx** (`smit_csc_frontend`), serving the optimized React frontend.

#### Step 4: Bootstrapping the Database Schema (Crucial!)
Because the Postgres container boots with a completely clean database, you must push the tables (schemas) before users can log in or register.

To bypass any global `pnpm` workspace constraints or script approvals on the VM, execute Drizzle Kit directly from the `lib/db` folder using `npx`:
```bash
# Navigate to the DB package folder
cd lib/db

# Push the schema to the running database container
DATABASE_URL=postgresql://csc_admin:secure_db_password@localhost:5432/smit_csc npx -y drizzle-kit push --config ./drizzle.config.ts

# Return to the root folder
cd ../..
```

#### Step 5: Verify Deployment
Your app is now 100% active!
- **Frontend SPA**: Access at `http://<your-vm-ip>` (Served on port 80).
- **Backend API**: Access at `http://<your-vm-ip>/api` (Mapped to the API server through Nginx proxy).
- **Postgres Database**: Accessible internally in the Docker network, or from your VM host at `localhost:5432`.

#### Managing Containers
```bash
# View running containers & health status
docker compose ps

# Check backend application logs
docker compose logs api

# Check nginx frontend/proxy logs
docker compose logs frontend

# Stop the application gracefully (data is persistent)
docker compose down
```
