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

  {
    num: 14,
    title: "પિતાના મરણ પર માતાની વિધવા સહાય માટે પુત્રો દ્વારા વારસાઈ સોગંદનામું",
    fileBase: "14-mata-varsai-putra-affidavit",
    description: "પિતાના મરણ પર માતાની વિધવા સહાય માટે પુત્રો દ્વારા વારસાઈ સોગંદનામું",
  },
  {
    num: 15,
    title: "LIC પોલીસી નોમિની નામ વિસંગતતા સોગંદનામું",
    fileBase: "15-lic-policy-naam-visangatata-affidavit",
    description: "LIC પોલીસી નોમિની નામ વિસંગતતા સોગંદનામું",
  },
  {
    num: 16,
    title: "વૃધ્ધ પેન્શન યોજના — BPL યાદીમાં નામની સ્પેલિંગ ભૂલ સોગંદનામું",
    fileBase: "16-vrudh-pension-naam-spelling-affidavit",
    description: "વૃધ્ધ પેન્શન યોજના — BPL યાદીમાં નામની સ્પેલિંગ ભૂલ સોગંદનામું",
  },
  {
    num: 17,
    title: "આવાસ યોજના — સંયુક્ત સહહિસ્સેદારના મરણ પ્રમાણપત્ર ના મળવા અંગેનું સોગંદનામું",
    fileBase: "17-awas-yojana-sahhissedar-maran-affidavit",
    description: "આવાસ યોજના — સંયુક્ત સહહિસ્સેદારના મરણ પ્રમાણપત્ર ના મળવા અંગેનું સોગંદનામું",
  },
  {
    num: 18,
    title: "બેંક FD (ફિક્સ ડિપોઝીટ) રસીદ ગુમ થયા અંગેનું સોગંદનામું",
    fileBase: "18-bank-fd-receipt-gum-affidavit",
    description: "બેંક FD (ફિક્સ ડિપોઝીટ) રસીદ ગુમ થયા અંગેનું સોગંદનામું",
  },
  {
    num: 19,
    title: "દિવ્યાંગ લગ્ન સહાય યોજના સોગંદનામું",
    fileBase: "19-divyang-lagna-sahay-affidavit",
    description: "દિવ્યાંગ લગ્ન સહાય યોજના સોગંદનામું",
  },
  {
    num: 20,
    title: "ટ્રસ્ટ રાજીનામું/નવા ટ્રસ્ટીની નિમણૂક સ્વીકારવા અંગેનું સોગંદનામું",
    fileBase: "20-trust-rajinamu-affidavit",
    description: "ટ્રસ્ટ રાજીનામું/નવા ટ્રસ્ટીની નિમણૂક સ્વીકારવા અંગેનું સોગંદનામું",
  },
  {
    num: 21,
    title: "જમીન મહેસુલ રેકર્ડ — ગુજરેલ વારસદારનું નામ કમી કરવા સોગંદનામું",
    fileBase: "21-jamin-mahesul-varsai-name-update-affidavit",
    description: "જમીન મહેસુલ રેકર્ડ — ગુજરેલ વારસદારનું નામ કમી કરવા સોગંદનામું",
  },
  {
    num: 22,
    title: "પતિ એકલો વારસદાર (પત્નીના મરણ પછી બેંક ખાતું) સોગંદનામું",
    fileBase: "22-pati-eklu-varsdar-bank-affidavit",
    description: "પતિ એકલો વારસદાર (પત્નીના મરણ પછી બેંક ખાતું) સોગંદનામું",
  },
  {
    num: 23,
    title: "માછીમારી બોટ (FRP OBM) — કેસ/દેવું ન હોવા બાહેંધરી",
    fileBase: "23-fishing-boat-bahendhari",
    description: "માછીમારી બોટ (FRP OBM) — કેસ/દેવું ન હોવા બાહેંધરી",
  },
  {
    num: 24,
    title: "નવો વ્યવસાય — PGVCL વિજ કનેક્શન સોગંદનામું",
    fileBase: "24-navo-vyavsay-pgvcl-connection-affidavit",
    description: "નવો વ્યવસાય — PGVCL વિજ કનેક્શન સોગંદનામું",
  },
  {
    num: 25,
    title: "માનસિક વિકલાંગ સંતાનના ગાર્ડિયન બનવા સોગંદનામું",
    fileBase: "25-guardian-viklang-santan-affidavit",
    description: "માનસિક વિકલાંગ સંતાનના ગાર્ડિયન બનવા સોગંદનામું",
  },
  {
    num: 26,
    title: "કેન્સર/ગંભીર બિમારી સારવાર આવક સોગંદનામું",
    fileBase: "26-cancer-bimari-aavak-affidavit",
    description: "કેન્સર/ગંભીર બિમારી સારવાર આવક સોગંદનામું",
  },
  {
    num: 27,
    title: "કૂવા/વિજ કનેક્શન — વારસદારો વચ્ચે વાંધા ન હોવા સોગંદનામું",
    fileBase: "27-kuva-vij-varsdar-no-dispute-affidavit",
    description: "કૂવા/વિજ કનેક્શન — વારસદારો વચ્ચે વાંધા ન હોવા સોગંદનામું",
  },
  {
    num: 28,
    title: "પરિવારમાં જમીન હક-જતો સમાધાન સોગંદનામું",
    fileBase: "28-parivar-jamin-hakk-jato-affidavit",
    description: "પરિવારમાં જમીન હક-જતો સમાધાન સોગંદનામું",
  },
  {
    num: 29,
    title: "બ્લુ રીવોલ્યુશન યોજના — રેફ્રિજરેટર વાન સહાય સોગંદનામું",
    fileBase: "29-blue-revolution-van-affidavit",
    description: "બ્લુ રીવોલ્યુશન યોજના — રેફ્રિજરેટર વાન સહાય સોગંદનામું",
  },
  {
    num: 30,
    title: "એપ્રેન્ટીસ તાલીમ — અગાઉ તાલીમ ના લીધા હોવા સોગંદનામું",
    fileBase: "30-apprentice-training-affidavit",
    description: "એપ્રેન્ટીસ તાલીમ — અગાઉ તાલીમ ના લીધા હોવા સોગંદનામું",
  },
  {
    num: 31,
    title: "વ્યવસાયનું નામ બદલવા બેંક ખાતામાં સોગંદનામું",
    fileBase: "31-business-naam-bank-badlav-affidavit",
    description: "વ્યવસાયનું નામ બદલવા બેંક ખાતામાં સોગંદનામું",
  },
  {
    num: 32,
    title: "શાળા છોડ્યાના પ્રમાણપત્રમાં જાતિ/પેટા-જાતિ કલમ સુધારો સોગંદનામું",
    fileBase: "32-shala-jaati-column-sudharo-affidavit",
    description: "શાળા છોડ્યાના પ્રમાણપત્રમાં જાતિ/પેટા-જાતિ કલમ સુધારો સોગંદનામું",
  },
  {
    num: 33,
    title: "ખેતીની જમીન — વારસદાર પુત્ર દ્વારા સ્વયં ખેડાણ સોગંદનામું",
    fileBase: "33-swayam-khedan-varsdar-affidavit",
    description: "ખેતીની જમીન — વારસદાર પુત્ર દ્વારા સ્વયં ખેડાણ સોગંદનામું",
  },
  {
    num: 34,
    title: "જન્મ પ્રમાણપત્રમાં પિતાના નામમાં સુધારો — અરજી",
    fileBase: "34-janma-pramanpatra-pita-naam-application",
    description: "જન્મ પ્રમાણપત્રમાં પિતાના નામમાં સુધારો — અરજી",
  },
  {
    num: 35,
    title: "અંગુઠાના નિશાનની ઓળખ સોગંદનામું",
    fileBase: "35-angutha-nishan-olakh-affidavit",
    description: "અંગુઠાના નિશાનની ઓળખ સોગંદનામું",
  },
  {
    num: 36,
    title: "મેડિકલ સ્ટોર/ફાર્મસી — રજિસ્ટર્ડ ફાર્માસિસ્ટ એફિડેવિટ",
    fileBase: "36-medical-store-pharmacist-affidavit",
    description: "મેડિકલ સ્ટોર/ફાર્મસી — રજિસ્ટર્ડ ફાર્માસિસ્ટ એફિડેવિટ",
  },
  {
    num: 37,
    title: "કર્મચારીના હાલના રહેઠાણની ખાત્રી સોગંદનામું",
    fileBase: "37-halnu-rahethan-sarnamu-affidavit",
    description: "કર્મચારીના હાલના રહેઠાણની ખાત્રી સોગંદનામું",
  },
  {
    num: 38,
    title: "અપરણીત બિનવારસ સંબંધીના અવશાનનો દાખલો — અરજી",
    fileBase: "38-aparnit-binvaras-marran-dakhlo-application",
    description: "અપરણીત બિનવારસ સંબંધીના અવશાનનો દાખલો — અરજી",
  },
  {
    num: 39,
    title: "સેવાપોથી (સર્વિસ બુક) માં અટક સુધારો — પેન્શન સોગંદનામું",
    fileBase: "39-sevapothi-atak-sudharo-affidavit",
    description: "સેવાપોથી (સર્વિસ બુક) માં અટક સુધારો — પેન્શન સોગંદનામું",
  },
  {
    num: 40,
    title: "જમીન — બે અલગ ખાતા ભેગા કરવા (ખાતુ મર્જર) સોગંદનામું",
    fileBase: "40-jamin-khatu-merger-affidavit",
    description: "જમીન — બે અલગ ખાતા ભેગા કરવા (ખાતુ મર્જર) સોગંદનામું",
  },
  {
    num: 41,
    title: "યુનિવર્સિટી રેકોર્ડમાં ફોટોગ્રાફ અપડેટ સોગંદનામું",
    fileBase: "41-university-photo-update-affidavit",
    description: "યુનિવર્સિટી રેકોર્ડમાં ફોટોગ્રાફ અપડેટ સોગંદનામું",
  },
  {
    num: 42,
    title: "વિદ્યુત સહાયક ભરતી — નિમણૂંક સ્વીકારવા બાહેંધરી",
    fileBase: "42-vidyut-sahayak-bharti-bahendhari",
    description: "વિદ્યુત સહાયક ભરતી — નિમણૂંક સ્વીકારવા બાહેંધરી",
  },
  {
    num: 43,
    title: "ESIC — ડિપેન્ડન્ટ પેરેન્ટ સોગંદનામું",
    fileBase: "43-esic-dependent-parent-affidavit",
    description: "ESIC — ડિપેન્ડન્ટ પેરેન્ટ સોગંદનામું",
  },
  {
    num: 44,
    title: "ડિગ્રી/પદવી પ્રમાણપત્ર ગુમ થયા બાબત સોગંદનામું",
    fileBase: "44-degree-certificate-gum-affidavit",
    description: "ડિગ્રી/પદવી પ્રમાણપત્ર ગુમ થયા બાબત સોગંદનામું",
  },
  {
    num: 45,
    title: "Single/Unmarried Status Declaration Affidavit (English)",
    fileBase: "45-single-unmarried-status-affidavit-EN",
    description: "Single/Unmarried Status Declaration Affidavit (English)",
  },
  {
    num: 46,
    title: "Name/Surname Discrepancy Affidavit (English)",
    fileBase: "46-name-discrepancy-affidavit-EN",
    description: "Name/Surname Discrepancy Affidavit (English)",
  },
  {
    num: 47,
    title: "ધોરણ-8 પ્રવેશ માટે અભ્યાસ ગેપ (Study Gap Year) બાહેંધરી",
    fileBase: "47-abhyas-gap-varsh-bahendhari",
    description: "ધોરણ-8 પ્રવેશ માટે અભ્યાસ ગેપ (Study Gap Year) બાહેંધરી",
  },
  {
    num: 48,
    title: "સ્વાતંત્ર્ય સેનાની/શહીદ વારસદારો — હાઉસ ટેક્સ માફી સોગંદનામું",
    fileBase: "48-swatantra-senani-house-tax-mafi-affidavit",
    description: "સ્વાતંત્ર્ય સેનાની/શહીદ વારસદારો — હાઉસ ટેક્સ માફી સોગંદનામું",
  },
  {
    num: 49,
    title: "ભૂમિહીન ખેતમજૂર દાખલો સોગંદનામું",
    fileBase: "49-bhoomihin-khetmajur-dakhlo-affidavit",
    description: "ભૂમિહીન ખેતમજૂર દાખલો સોગંદનામું",
  },
  {
    num: 50,
    title: "પેન્શનર મરણ પછી બાકી પગાર/એરિયર્સ — અન્ય વારસદારોની સંમતિ સોગંદનામું",
    fileBase: "50-pensioner-arrears-consent-affidavit",
    description: "પેન્શનર મરણ પછી બાકી પગાર/એરિયર્સ — અન્ય વારસદારોની સંમતિ સોગંદનામું",
  },
  {
    num: 51,
    title: "બાલિકા સમૃદ્ધિ યોજના ખાતામાંથી ભૂલથી જમા થયેલ રકમ ઉપાડવા સોગંદનામું",
    fileBase: "51-balika-samruddhi-rakam-upad-affidavit",
    description: "બાલિકા સમૃદ્ધિ યોજના ખાતામાંથી ભૂલથી જમા થયેલ રકમ ઉપાડવા સોગંદનામું",
  },
  {
    num: 52,
    title: "કૌટુંબિક હિસ્સા વહેંચણી સોગંદનામું",
    fileBase: "52-koutumbik-hissa-vahenchani-affidavit",
    description: "કૌટુંબિક હિસ્સા વહેંચણી સોગંદનામું",
  },
  {
    num: 53,
    title: "માતા-પિતાના મરણ પ્રમાણપત્ર ના મળવા છતાં અવશાન અંગેનું સોગંદનામું",
    fileBase: "53-matapita-marran-pramanpatra-medical-affidavit",
    description: "માતા-પિતાના મરણ પ્રમાણપત્ર ના મળવા છતાં અવશાન અંગેનું સોગંદનામું",
  },
];

async function main() {
  console.log("=== Starting 53 Affidavit Templates Seeding ===");

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
    `-- Generated Seed Script for 53 Affidavit Templates`,
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
      console.log("=== All 53 Affidavits Successfully Seeded into Database! ===");
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
