import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import { getDocumentBuffer } from "../../artifacts/api-server/src/routes/documents"; // I need to import getDocumentBuffer correctly

async function runAudit() {
  console.log("=== LIVE DATA AUDIT (READ-ONLY) ===");
  
  await db.execute(sql`BEGIN READ ONLY`);
  try {
    const { rows: docs } = await db.execute(sql`SELECT * FROM documents`);
    
    // 1. Row counts by category
    const byCategory = docs.reduce((acc, d) => {
      acc[d.category] = (acc[d.category] || 0) + 1;
      return acc;
    }, {});
    console.log("\nCounts by Category:", byCategory);

    // 2. Distinct is_prime and access_level
    const accessPairs = new Set(docs.map(d => `${d.is_prime} / ${d.access_level}`));
    console.log("\nDistinct [is_prime / access_level]:", Array.from(accessPairs));

    // 3. Group ID integrity
    const grouped = docs.filter(d => d.group_id);
    const orphans = docs.filter(d => !d.group_id);
    
    // Count duplicates of group_id
    const groupCounts = grouped.reduce((acc, d) => {
      acc[d.group_id] = (acc[d.group_id] || 0) + 1;
      return acc;
    }, {});
    const duplicates = Object.entries(groupCounts).filter(([_, c]) => (c as number) > 1);
    
    // NFC/whitespace title variants
    const titleNorm = new Map();
    const titleVariants = new Set();
    for (const d of docs) {
      const norm = (d.title || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
      if (titleNorm.has(norm) && titleNorm.get(norm) !== d.title) {
        titleVariants.add(`${d.title} vs ${titleNorm.get(norm)}`);
      }
      titleNorm.set(norm, d.title);
    }

    console.log("\nGroup ID Integrity:");
    console.log(`- Docs with group_id: ${grouped.length}`);
    console.log(`- Orphan docs (no group_id): ${orphans.length}`);
    console.log(`- Duplicate group_ids (should be 0 if grouped): ${duplicates.length}`);
    console.log(`- Title variants found: ${titleVariants.size}`);
    
    // 4. Distinct fileUrl/wordUrl URL patterns (prefixes)
    const prefixes = new Set();
    for (const d of docs) {
      if (d.file_url) prefixes.add(d.file_url.split('/')[1] || d.file_url);
      if (d.word_url) prefixes.add(d.word_url.split('/')[1] || d.word_url);
    }
    console.log("\nURL Prefixes found:", Array.from(prefixes));

    // 5. Missing/Unreadable files via getDocumentBuffer (mock logic)
    let missingCount = 0;
    // Note: getDocumentBuffer in script context might not have right CWD.
    // We will attempt to stat files if local.
    for (const d of docs) {
       // Just doing basic path checks as getDocumentBuffer relies on process.cwd()
       if (!d.file_url.startsWith('http')) {
         const p = path.resolve(process.cwd(), '..', '..', d.file_url.replace(/^\/?/, ''));
         try {
           await fs.stat(p);
         } catch {
           missingCount++;
         }
       }
    }
    console.log(`\nMissing/unreadable files: ~${missingCount}`);
    
  } finally {
    await db.execute(sql`ROLLBACK`);
    console.log("\n=== AUDIT COMPLETE ===");
  }
}

runAudit().catch(err => {
  console.error("Audit failed:", err);
  process.exit(1);
});
