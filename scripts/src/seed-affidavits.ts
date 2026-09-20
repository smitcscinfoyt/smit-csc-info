import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");

export const AFFIDAVITS_SEED_DATA = [
  {
    num: 1,
    title: "વિધવા સહાય સોગંદનામું",
    fileBase: "1-vidhava-sahay-affidavit",
    description: "વિધવા સહાય યોજના માટેનું અધિકૃત સોગંદનામું (PDF + Word ફોર્મેટ)",
  },
  {
    num: 2,
    title: "દાગીના/બેંક પહોંચ ગુમ થયા અંગેનું સોગંદનામું",
    fileBase: "2-dagina-bank-pahoch-gum-affidavit",
    description: "બેંક પહોંચ અથવા સોના-ચાંદીના દાગીના ગુમ થયા અંગેનું સોગંદનામું",
  },
  {
    num: 3,
    title: "વારસાઈ/પેઢીનામું સોગંદનામું",
    fileBase: "3-varsai-pedhinamu-affidavit",
    description: "વારસાઈ હક્ક અને પેઢીનામા માટેનું પ્રમાણિત સોગંદનામું",
  },
  {
    num: 4,
    title: "નામ/અટકની વિસંગતતા અંગેનું સોગંદનામું",
    fileBase: "4-naam-visangatata-affidavit",
    description: "સરકારી દસ્તાવેજોમાં નામ કે અટકમાં વિસંગતતા સુધારવા માટેનું સોગંદનામું",
  },
  {
    num: 5,
    title: "નિરાધાર વિધવા આર્થિક સહાય સોગંદનામું",
    fileBase: "5-nirdhar-vidhva-aarthik-sahay-affidavit",
    description: "નિરાધાર વૃદ્ધ/વિધવા આર્થિક સહાય યોજના માટેનું સોગંદનામું",
  },
  {
    num: 6,
    title: "કુંવરબાઈનું મામેરું યોજના સોગંદનામું",
    fileBase: "6-kuvarbai-mameru-affidavit",
    description: "કુંવરબાઈનું મામેરું યોજના હેઠળ સહાય મેળવવા માટેનું સોગંદનામું",
  },
  {
    num: 7,
    title: "અકસ્માતે મરણ પામનાર ખેડુતના વારસદારો સોગંદનામું",
    fileBase: "7-khedut-akasmat-varsai-affidavit",
    description: "ખેડૂત અકસ્માત વીમા યોજના હેઠળ વારસદારોનું સોગંદનામું",
  },
  {
    num: 8,
    title: "સરકારી ભરતી માટે પુનઃલગ્ન ન કર્યાનું સોગંદનામું",
    fileBase: "8-punarlagna-bharti-affidavit",
    description: "સરકારી ભરતીમાં વિધવા અનામત માટે પુનઃલગ્ન ન કર્યા અંગેનું સોગંદનામું",
  },
  {
    num: 9,
    title: "લોન/સબસીડી ના લીધા + આવક સોગંદનામું",
    fileBase: "9-loan-subsidy-aavak-affidavit",
    description: "કોઈપણ સરકારી યોજનામાં લોન કે સબસીડી ન લીધા અંગે તેમજ આવકનું સોગંદનામું",
  },
  {
    num: 10,
    title: "નિઃસંતાન વારસાઈ સોગંદનામું",
    fileBase: "10-nihsantan-varsai-affidavit",
    description: "નિઃસંતાન વ્યક્તિની મિલકત વારસાઈ નોંધણી માટેનું સોગંદનામું",
  },
  {
    num: 11,
    title: "ઉંમર/જન્મતારીખ અંગેનું સોગંદનામું",
    fileBase: "11-umar-janmtarikh-affidavit",
    description: "જન્મતારીખ કે ઉંમરની સાબિતી અંગેનું અધિકૃત સોગંદનામું",
  },
  {
    num: 12,
    title: "વારસાઈ + વાર્ષિક આવક સોગંદનામું",
    fileBase: "12-varsai-aavak-affidavit",
    description: "વારસાઈ અને કુટુંબની વાર્ષિક આવકનું સંયુક્ત સોગંદનામું",
  },
  {
    num: 13,
    title: "વિધવા સહાય પુનઃ ચાલુ કરવા અંગેની અરજી",
    fileBase: "13-vidhva-sahay-band-chalu-application",
    description: "બંધ થયેલી વિધવા સહાય પેન્શન પુનઃ ચાલુ કરાવવા માટેની અરજી (Application)",
  },
];

async function main() {
  console.log("=== Starting 13 Affidavit Templates Seeding ===");

  const targetDir = path.resolve(ROOT_DIR, "attached_assets", "documents");
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Check files on disk
  for (const item of AFFIDAVITS_SEED_DATA) {
    const pdfPath = path.resolve(targetDir, `${item.fileBase}.pdf`);
    const docxPath = path.resolve(targetDir, `${item.fileBase}.docx`);
    const hasPdf = fs.existsSync(pdfPath);
    const hasDocx = fs.existsSync(docxPath);
    console.log(`[File Check] #${item.num} ${item.fileBase}: PDF=${hasPdf}, Word=${hasDocx}`);
  }

  // Also write SQL seed file for direct execution on server/Docker
  const sqlLines = [
    `-- Generated Seed Script for 13 Affidavit Templates`,
    `-- Category: Affidavits, Access: login_required, Pair: PDF + Word`,
    `-- IDEMPOTENT: Safe to run multiple times without creating duplicates.`,
    ``,
    `-- 1. Deduplicate any existing rows with the same group_id (keeps latest row)`,
    `DELETE FROM documents a USING documents b`,
    `WHERE a.id < b.id AND a.group_id IS NOT NULL AND a.group_id = b.group_id;`,
    ``,
    `-- 2. Ensure unique index on group_id exists for ON CONFLICT resolution`,
    `CREATE UNIQUE INDEX IF NOT EXISTS documents_group_id_unique ON documents (group_id);`,
    ``,
  ];

  for (const item of AFFIDAVITS_SEED_DATA) {
    const pdfUrl = `/attached_assets/documents/${item.fileBase}.pdf`;
    const wordUrl = `/attached_assets/documents/${item.fileBase}.docx`;
    const pdfFileName = `${item.fileBase}.pdf`;
    const wordFileName = `${item.fileBase}.docx`;
    const groupId = `affidavit-${item.num}`;

    sqlLines.push(`
-- Link by title if group_id was previously NULL
UPDATE documents SET group_id = '${groupId}' WHERE title = '${item.title.replace(/'/g, "''")}' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  '${item.title.replace(/'/g, "''")}',
  '${item.description.replace(/'/g, "''")}',
  '${pdfUrl}',
  '${pdfFileName}',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  '${groupId}',
  '${wordUrl}',
  '${wordFileName}',
  NOW()
)
ON CONFLICT (group_id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  file_url = EXCLUDED.file_url,
  file_name = EXCLUDED.file_name,
  file_type = EXCLUDED.file_type,
  category = EXCLUDED.category,
  is_prime = EXCLUDED.is_prime,
  access_level = EXCLUDED.access_level,
  word_url = EXCLUDED.word_url,
  word_file_name = EXCLUDED.word_file_name;`);
  }

  const sqlFilePath = path.resolve(ROOT_DIR, "scripts", "seed-affidavits.sql");
  fs.writeFileSync(sqlFilePath, sqlLines.join("\n"), "utf8");
  console.log(`[SQL Generated] Saved SQL seed script to: ${sqlFilePath}`);

  // If DATABASE_URL is set and reachable, insert via Drizzle ORM
  if (process.env.DATABASE_URL) {
    try {
      console.log("[DB] Connecting to PostgreSQL database...");
      const { db, documentsTable } = await import("@workspace/db");
      const { eq, or } = await import("drizzle-orm");

      for (const item of AFFIDAVITS_SEED_DATA) {
        const pdfUrl = `/attached_assets/documents/${item.fileBase}.pdf`;
        const wordUrl = `/attached_assets/documents/${item.fileBase}.docx`;
        const pdfFileName = `${item.fileBase}.pdf`;
        const wordFileName = `${item.fileBase}.docx`;
        const groupId = `affidavit-${item.num}`;

        // Check if already exists by groupId or title
        const [existing] = await db
          .select()
          .from(documentsTable)
          .where(or(eq(documentsTable.groupId, groupId), eq(documentsTable.title, item.title)))
          .limit(1);

        if (existing) {
          console.log(`[DB Exists] #${item.num} "${item.title}" already present (ID: ${existing.id}). Updating...`);
          await db
            .update(documentsTable)
            .set({
              title: item.title,
              description: item.description,
              fileUrl: pdfUrl,
              fileName: pdfFileName,
              fileType: "PDF",
              category: "Affidavits",
              isPrime: true,
              accessLevel: "login_required",
              wordUrl,
              wordFileName,
            })
            .where(eq(documentsTable.id, existing.id));
        } else {
          console.log(`[DB Insert] Inserting #${item.num} "${item.title}"...`);
          await db.insert(documentsTable).values({
            title: item.title,
            description: item.description,
            fileUrl: pdfUrl,
            fileName: pdfFileName,
            fileType: "PDF",
            category: "Affidavits",
            isPrime: true,
            accessLevel: "login_required",
            groupId,
            wordUrl,
            wordFileName,
          });
        }
      }
      console.log("=== All 13 Affidavits Successfully Seeded into Database! ===");
    } catch (dbErr: any) {
      console.warn(`[DB Notice] Could not connect to local database directly: ${dbErr?.message}`);
      console.log(`Use the generated SQL script 'scripts/seed-affidavits.sql' or 'deploy.sh' to execute the seeding in production.`);
    }
  } else {
    console.log("[Notice] DATABASE_URL not set in local environment. SQL file generated for migration.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error during seeding:", err);
    process.exit(1);
  });
