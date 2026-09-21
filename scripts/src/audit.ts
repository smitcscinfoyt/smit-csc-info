import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function run() {
  const allDocs = await db.execute(sql`SELECT * FROM documents`);
  console.log(`Total rows in documents table: ${allDocs.rows.length}`);
  
  const byCategory = await db.execute(sql`SELECT category, count(*) FROM documents GROUP BY category`);
  console.log(`\nBy Category:`, byCategory.rows);
  
  const isPrimeStats = await db.execute(sql`SELECT is_prime, access_level, count(*) FROM documents GROUP BY is_prime, access_level`);
  console.log(`\nIs Prime & Access Level distinct pairs:`, isPrimeStats.rows);
  
  // Group ID integrity
  const nullGroupId = await db.execute(sql`SELECT count(*) FROM documents WHERE group_id IS NULL OR group_id = ''`);
  console.log(`\nDocs with no group_id:`, nullGroupId.rows[0].count);
  
  // Check orphaned words or pdfs
  const words = allDocs.rows.filter(d => d.file_type === 'Word');
  const pdfs = allDocs.rows.filter(d => d.file_type === 'PDF');
  console.log(`\nTotal Word docs: ${words.length}`);
  console.log(`Total PDF docs: ${pdfs.length}`);

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
