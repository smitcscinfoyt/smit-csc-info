import { db, documentsTable } from "@workspace/db";

async function run() {
  const docs = await db.select().from(documentsTable);
  console.log("Total docs:", docs.length);
  const pdfs = docs.filter(d => d.fileType === "PDF");
  const words = docs.filter(d => d.fileType === "Word");
  console.log("PDFs:", pdfs.length, "Words:", words.length);

  const sample = docs.slice(0, 5);
  console.log("Sample docs:", JSON.stringify(sample, null, 2));
  process.exit(0);
}
run().catch(console.error);
