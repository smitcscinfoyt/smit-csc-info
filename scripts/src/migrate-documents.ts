import { db, documentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

export function normalizeTitle(title: string): string {
  return title
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Pure function to calculate migrations for existing documents.
 */
export function calculateMigrationPlan(allDocs: any[]) {
  const updates = [];
  const deletions = [];

  const docsWithoutGroup = allDocs.filter(
    (d) => !d.groupId && (d.fileType === "PDF" || d.fileType === "Word")
  );

  const titleGroups = new Map<string, any[]>();
  for (const doc of docsWithoutGroup) {
    const norm = normalizeTitle(doc.title);
    if (!titleGroups.has(norm)) titleGroups.set(norm, []);
    titleGroups.get(norm)!.push(doc);
  }

  for (const [normTitle, docs] of titleGroups.entries()) {
    if (docs.length > 1) {
      const pdfs = docs.filter((d) => d.fileType === "PDF");
      const words = docs.filter((d) => d.fileType === "Word");

      if (pdfs.length === 1 && words.length === 1) {
        const pdf = pdfs[0];
        const word = words[0];
        // Merge into PDF
        updates.push({
          id: pdf.id,
          groupId: `migrated-group-${pdf.id}`,
          wordUrl: word.wordUrl || word.fileUrl,
          wordFileName: word.wordFileName || word.fileName,
        });
        deletions.push(word.id);
      }
    } else if (docs.length === 1) {
      const doc = docs[0];
      if (doc.fileType === "PDF") {
        updates.push({
          id: doc.id,
          groupId: `migrated-group-${doc.id}`,
        });
      }
    }
  }

  return { updates, deletions };
}

export async function migrateDocuments(execute = false) {
  console.log(`Starting Document Migration (Execute: ${execute})`);

  // Force transaction
  const txn = await db.execute(sql`BEGIN`);
  
  try {
    const { rows: allDocs } = await db.execute(sql`SELECT * FROM documents`);
    const { updates, deletions } = calculateMigrationPlan(allDocs);

    console.log(`Planned PDF Updates: ${updates.length}`);
    console.log(`Planned Word Deletions: ${deletions.length}`);

    // Execute updates
    for (const update of updates) {
      const setObj: any = {};
      if (update.groupId !== undefined) setObj.groupId = update.groupId;
      if (update.wordUrl !== undefined) setObj.wordUrl = update.wordUrl;
      if (update.wordFileName !== undefined) setObj.wordFileName = update.wordFileName;

      await db.update(documentsTable)
        .set(setObj)
        .where(eq(documentsTable.id, update.id));
    }

    // Execute deletions
    for (const id of deletions) {
      await db.delete(documentsTable).where(eq(documentsTable.id, id));
    }

    if (execute) {
      await db.execute(sql`COMMIT`);
      console.log("Migration COMMITTED successfully.");
    } else {
      await db.execute(sql`ROLLBACK`);
      console.log("Migration ROLLBACK successful (Dry-Run mode).");
    }
  } catch (err) {
    await db.execute(sql`ROLLBACK`);
    console.error("Migration failed, rolled back.", err);
    throw err;
  }
}
