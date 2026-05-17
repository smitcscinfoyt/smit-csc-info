#!/usr/bin/env node
import { dirname, join, resolve } from "node:path";
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const outDir = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(__dirname, "..", "public", "tess");

const stampFile = join(outDir, ".version");
const STAMP = "v1-tess7";

function shouldRebuild() {
  if (!existsSync(stampFile)) return true;
  try {
    const cur = readdirSync(outDir);
    if (!cur.includes("worker.min.js")) return true;
    if (!cur.includes("core")) return true;
    if (!cur.includes("lang")) return true;
    const lang = readdirSync(join(outDir, "lang"));
    if (!lang.includes("eng.traineddata.gz")) return true;
    const stamp = require("node:fs").readFileSync(stampFile, "utf8");
    return stamp.trim() !== STAMP;
  } catch {
    return true;
  }
}

if (!shouldRebuild()) {
  console.log("[copy-tesseract] up-to-date, skipping.");
  process.exit(0);
}

console.log("[copy-tesseract] writing assets to", outDir);

mkdirSync(outDir, { recursive: true });
const coreOutDir = join(outDir, "core");
mkdirSync(coreOutDir, { recursive: true });
const langOutDir = join(outDir, "lang");
mkdirSync(langOutDir, { recursive: true });

const tessJsPkg = require.resolve("tesseract.js/package.json");
const tessJsDir = dirname(tessJsPkg);
const workerSrc = join(tessJsDir, "dist", "worker.min.js");
copyFileSync(workerSrc, join(outDir, "worker.min.js"));
console.log("  ✓ worker.min.js");

// `tesseract.js-core` is a peer of `tesseract.js`. Under pnpm it lives
// alongside tesseract.js in the .pnpm store, but it's NOT directly visible
// to this script's require path. Make a Require *as if* we were inside
// tesseract.js so its peers resolve correctly.
const tessJsRequire = createRequire(tessJsPkg);
const coreJsPkg = tessJsRequire.resolve("tesseract.js-core/package.json");
const coreJsDir = dirname(coreJsPkg);
let coreCount = 0;
for (const f of readdirSync(coreJsDir)) {
  if (
    f.endsWith(".wasm") ||
    f.endsWith(".wasm.js") ||
    f.endsWith(".js") && !f.startsWith("README")
  ) {
    copyFileSync(join(coreJsDir, f), join(coreOutDir, f));
    coreCount++;
  }
}
console.log(`  ✓ tesseract-core (${coreCount} files)`);

const engPath = join(langOutDir, "eng.traineddata.gz");
if (!existsSync(engPath) || statSync(engPath).size < 100_000) {
  console.log("  · downloading eng.traineddata.gz (~10MB)…");
  const url = "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz";
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download eng.traineddata.gz: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(engPath, buf);
  console.log(`  ✓ eng.traineddata.gz (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
} else {
  console.log("  ✓ eng.traineddata.gz (cached)");
}

writeFileSync(stampFile, STAMP);
console.log("[copy-tesseract] done.");
