-- Generated Seed Script for 13 Affidavit Templates
-- Category: Affidavits, Access: login_required, Pair: PDF + Word
-- IDEMPOTENT: Safe to run multiple times without creating duplicates.

-- 1. Deduplicate any existing rows with the same group_id (keeps latest row)
DELETE FROM documents a USING documents b
WHERE a.id < b.id AND a.group_id IS NOT NULL AND a.group_id = b.group_id;

-- 2. Ensure unique index on group_id exists for ON CONFLICT resolution
CREATE UNIQUE INDEX IF NOT EXISTS documents_group_id_unique ON documents (group_id);


-- Link by title if group_id was previously NULL
UPDATE documents SET group_id = 'affidavit-1' WHERE title = 'વિધવા સહાય સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'વિધવા સહાય સોગંદનામું',
  'વિધવા સહાય યોજના માટેનું અધિકૃત સોગંદનામું (PDF + Word ફોર્મેટ)',
  '/attached_assets/documents/1-vidhava-sahay-affidavit.pdf',
  '1-vidhava-sahay-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-1',
  '/attached_assets/documents/1-vidhava-sahay-affidavit.docx',
  '1-vidhava-sahay-affidavit.docx',
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
  word_file_name = EXCLUDED.word_file_name;

-- Link by title if group_id was previously NULL
UPDATE documents SET group_id = 'affidavit-2' WHERE title = 'દાગીના/બેંક પહોંચ ગુમ થયા અંગેનું સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'દાગીના/બેંક પહોંચ ગુમ થયા અંગેનું સોગંદનામું',
  'બેંક પહોંચ અથવા સોના-ચાંદીના દાગીના ગુમ થયા અંગેનું સોગંદનામું',
  '/attached_assets/documents/2-dagina-bank-pahoch-gum-affidavit.pdf',
  '2-dagina-bank-pahoch-gum-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-2',
  '/attached_assets/documents/2-dagina-bank-pahoch-gum-affidavit.docx',
  '2-dagina-bank-pahoch-gum-affidavit.docx',
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
  word_file_name = EXCLUDED.word_file_name;

-- Link by title if group_id was previously NULL
UPDATE documents SET group_id = 'affidavit-3' WHERE title = 'વારસાઈ/પેઢીનામું સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'વારસાઈ/પેઢીનામું સોગંદનામું',
  'વારસાઈ હક્ક અને પેઢીનામા માટેનું પ્રમાણિત સોગંદનામું',
  '/attached_assets/documents/3-varsai-pedhinamu-affidavit.pdf',
  '3-varsai-pedhinamu-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-3',
  '/attached_assets/documents/3-varsai-pedhinamu-affidavit.docx',
  '3-varsai-pedhinamu-affidavit.docx',
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
  word_file_name = EXCLUDED.word_file_name;

-- Link by title if group_id was previously NULL
UPDATE documents SET group_id = 'affidavit-4' WHERE title = 'નામ/અટકની વિસંગતતા અંગેનું સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'નામ/અટકની વિસંગતતા અંગેનું સોગંદનામું',
  'સરકારી દસ્તાવેજોમાં નામ કે અટકમાં વિસંગતતા સુધારવા માટેનું સોગંદનામું',
  '/attached_assets/documents/4-naam-visangatata-affidavit.pdf',
  '4-naam-visangatata-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-4',
  '/attached_assets/documents/4-naam-visangatata-affidavit.docx',
  '4-naam-visangatata-affidavit.docx',
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
  word_file_name = EXCLUDED.word_file_name;

-- Link by title if group_id was previously NULL
UPDATE documents SET group_id = 'affidavit-5' WHERE title = 'નિરાધાર વિધવા આર્થિક સહાય સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'નિરાધાર વિધવા આર્થિક સહાય સોગંદનામું',
  'નિરાધાર વૃદ્ધ/વિધવા આર્થિક સહાય યોજના માટેનું સોગંદનામું',
  '/attached_assets/documents/5-nirdhar-vidhva-aarthik-sahay-affidavit.pdf',
  '5-nirdhar-vidhva-aarthik-sahay-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-5',
  '/attached_assets/documents/5-nirdhar-vidhva-aarthik-sahay-affidavit.docx',
  '5-nirdhar-vidhva-aarthik-sahay-affidavit.docx',
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
  word_file_name = EXCLUDED.word_file_name;

-- Link by title if group_id was previously NULL
UPDATE documents SET group_id = 'affidavit-6' WHERE title = 'કુંવરબાઈનું મામેરું યોજના સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'કુંવરબાઈનું મામેરું યોજના સોગંદનામું',
  'કુંવરબાઈનું મામેરું યોજના હેઠળ સહાય મેળવવા માટેનું સોગંદનામું',
  '/attached_assets/documents/6-kuvarbai-mameru-affidavit.pdf',
  '6-kuvarbai-mameru-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-6',
  '/attached_assets/documents/6-kuvarbai-mameru-affidavit.docx',
  '6-kuvarbai-mameru-affidavit.docx',
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
  word_file_name = EXCLUDED.word_file_name;

-- Link by title if group_id was previously NULL
UPDATE documents SET group_id = 'affidavit-7' WHERE title = 'અકસ્માતે મરણ પામનાર ખેડુતના વારસદારો સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'અકસ્માતે મરણ પામનાર ખેડુતના વારસદારો સોગંદનામું',
  'ખેડૂત અકસ્માત વીમા યોજના હેઠળ વારસદારોનું સોગંદનામું',
  '/attached_assets/documents/7-khedut-akasmat-varsai-affidavit.pdf',
  '7-khedut-akasmat-varsai-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-7',
  '/attached_assets/documents/7-khedut-akasmat-varsai-affidavit.docx',
  '7-khedut-akasmat-varsai-affidavit.docx',
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
  word_file_name = EXCLUDED.word_file_name;

-- Link by title if group_id was previously NULL
UPDATE documents SET group_id = 'affidavit-8' WHERE title = 'સરકારી ભરતી માટે પુનઃલગ્ન ન કર્યાનું સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'સરકારી ભરતી માટે પુનઃલગ્ન ન કર્યાનું સોગંદનામું',
  'સરકારી ભરતીમાં વિધવા અનામત માટે પુનઃલગ્ન ન કર્યા અંગેનું સોગંદનામું',
  '/attached_assets/documents/8-punarlagna-bharti-affidavit.pdf',
  '8-punarlagna-bharti-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-8',
  '/attached_assets/documents/8-punarlagna-bharti-affidavit.docx',
  '8-punarlagna-bharti-affidavit.docx',
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
  word_file_name = EXCLUDED.word_file_name;

-- Link by title if group_id was previously NULL
UPDATE documents SET group_id = 'affidavit-9' WHERE title = 'લોન/સબસીડી ના લીધા + આવક સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'લોન/સબસીડી ના લીધા + આવક સોગંદનામું',
  'કોઈપણ સરકારી યોજનામાં લોન કે સબસીડી ન લીધા અંગે તેમજ આવકનું સોગંદનામું',
  '/attached_assets/documents/9-loan-subsidy-aavak-affidavit.pdf',
  '9-loan-subsidy-aavak-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-9',
  '/attached_assets/documents/9-loan-subsidy-aavak-affidavit.docx',
  '9-loan-subsidy-aavak-affidavit.docx',
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
  word_file_name = EXCLUDED.word_file_name;

-- Link by title if group_id was previously NULL
UPDATE documents SET group_id = 'affidavit-10' WHERE title = 'નિઃસંતાન વારસાઈ સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'નિઃસંતાન વારસાઈ સોગંદનામું',
  'નિઃસંતાન વ્યક્તિની મિલકત વારસાઈ નોંધણી માટેનું સોગંદનામું',
  '/attached_assets/documents/10-nihsantan-varsai-affidavit.pdf',
  '10-nihsantan-varsai-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-10',
  '/attached_assets/documents/10-nihsantan-varsai-affidavit.docx',
  '10-nihsantan-varsai-affidavit.docx',
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
  word_file_name = EXCLUDED.word_file_name;

-- Link by title if group_id was previously NULL
UPDATE documents SET group_id = 'affidavit-11' WHERE title = 'ઉંમર/જન્મતારીખ અંગેનું સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'ઉંમર/જન્મતારીખ અંગેનું સોગંદનામું',
  'જન્મતારીખ કે ઉંમરની સાબિતી અંગેનું અધિકૃત સોગંદનામું',
  '/attached_assets/documents/11-umar-janmtarikh-affidavit.pdf',
  '11-umar-janmtarikh-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-11',
  '/attached_assets/documents/11-umar-janmtarikh-affidavit.docx',
  '11-umar-janmtarikh-affidavit.docx',
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
  word_file_name = EXCLUDED.word_file_name;

-- Link by title if group_id was previously NULL
UPDATE documents SET group_id = 'affidavit-12' WHERE title = 'વારસાઈ + વાર્ષિક આવક સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'વારસાઈ + વાર્ષિક આવક સોગંદનામું',
  'વારસાઈ અને કુટુંબની વાર્ષિક આવકનું સંયુક્ત સોગંદનામું',
  '/attached_assets/documents/12-varsai-aavak-affidavit.pdf',
  '12-varsai-aavak-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-12',
  '/attached_assets/documents/12-varsai-aavak-affidavit.docx',
  '12-varsai-aavak-affidavit.docx',
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
  word_file_name = EXCLUDED.word_file_name;

-- Link by title if group_id was previously NULL
UPDATE documents SET group_id = 'affidavit-13' WHERE title = 'વિધવા સહાય પુનઃ ચાલુ કરવા અંગેની અરજી' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'વિધવા સહાય પુનઃ ચાલુ કરવા અંગેની અરજી',
  'બંધ થયેલી વિધવા સહાય પેન્શન પુનઃ ચાલુ કરાવવા માટેની અરજી (Application)',
  '/attached_assets/documents/13-vidhva-sahay-band-chalu-application.pdf',
  '13-vidhva-sahay-band-chalu-application.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-13',
  '/attached_assets/documents/13-vidhva-sahay-band-chalu-application.docx',
  '13-vidhva-sahay-band-chalu-application.docx',
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
  word_file_name = EXCLUDED.word_file_name;