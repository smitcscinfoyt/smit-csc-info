-- Generated Seed Script for 53 Affidavit Templates
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

-- Link by title if group_id was previously NULL
UPDATE documents SET group_id = 'affidavit-14' WHERE title = 'પિતાના મરણ પર માતાની વિધવા સહાય માટે પુત્રો દ્વારા વારસાઈ સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'પિતાના મરણ પર માતાની વિધવા સહાય માટે પુત્રો દ્વારા વારસાઈ સોગંદનામું',
  'પિતાના મરણ પર માતાની વિધવા સહાય માટે પુત્રો દ્વારા વારસાઈ સોગંદનામું',
  '/attached_assets/documents/14-mata-varsai-putra-affidavit.pdf',
  '14-mata-varsai-putra-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-14',
  '/attached_assets/documents/14-mata-varsai-putra-affidavit.docx',
  '14-mata-varsai-putra-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-15' WHERE title = 'LIC પોલીસી નોમિની નામ વિસંગતતા સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'LIC પોલીસી નોમિની નામ વિસંગતતા સોગંદનામું',
  'LIC પોલીસી નોમિની નામ વિસંગતતા સોગંદનામું',
  '/attached_assets/documents/15-lic-policy-naam-visangatata-affidavit.pdf',
  '15-lic-policy-naam-visangatata-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-15',
  '/attached_assets/documents/15-lic-policy-naam-visangatata-affidavit.docx',
  '15-lic-policy-naam-visangatata-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-16' WHERE title = 'વૃધ્ધ પેન્શન યોજના — BPL યાદીમાં નામની સ્પેલિંગ ભૂલ સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'વૃધ્ધ પેન્શન યોજના — BPL યાદીમાં નામની સ્પેલિંગ ભૂલ સોગંદનામું',
  'વૃધ્ધ પેન્શન યોજના — BPL યાદીમાં નામની સ્પેલિંગ ભૂલ સોગંદનામું',
  '/attached_assets/documents/16-vrudh-pension-naam-spelling-affidavit.pdf',
  '16-vrudh-pension-naam-spelling-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-16',
  '/attached_assets/documents/16-vrudh-pension-naam-spelling-affidavit.docx',
  '16-vrudh-pension-naam-spelling-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-17' WHERE title = 'આવાસ યોજના — સંયુક્ત સહહિસ્સેદારના મરણ પ્રમાણપત્ર ના મળવા અંગેનું સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'આવાસ યોજના — સંયુક્ત સહહિસ્સેદારના મરણ પ્રમાણપત્ર ના મળવા અંગેનું સોગંદનામું',
  'આવાસ યોજના — સંયુક્ત સહહિસ્સેદારના મરણ પ્રમાણપત્ર ના મળવા અંગેનું સોગંદનામું',
  '/attached_assets/documents/17-awas-yojana-sahhissedar-maran-affidavit.pdf',
  '17-awas-yojana-sahhissedar-maran-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-17',
  '/attached_assets/documents/17-awas-yojana-sahhissedar-maran-affidavit.docx',
  '17-awas-yojana-sahhissedar-maran-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-18' WHERE title = 'બેંક FD (ફિક્સ ડિપોઝીટ) રસીદ ગુમ થયા અંગેનું સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'બેંક FD (ફિક્સ ડિપોઝીટ) રસીદ ગુમ થયા અંગેનું સોગંદનામું',
  'બેંક FD (ફિક્સ ડિપોઝીટ) રસીદ ગુમ થયા અંગેનું સોગંદનામું',
  '/attached_assets/documents/18-bank-fd-receipt-gum-affidavit.pdf',
  '18-bank-fd-receipt-gum-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-18',
  '/attached_assets/documents/18-bank-fd-receipt-gum-affidavit.docx',
  '18-bank-fd-receipt-gum-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-19' WHERE title = 'દિવ્યાંગ લગ્ન સહાય યોજના સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'દિવ્યાંગ લગ્ન સહાય યોજના સોગંદનામું',
  'દિવ્યાંગ લગ્ન સહાય યોજના સોગંદનામું',
  '/attached_assets/documents/19-divyang-lagna-sahay-affidavit.pdf',
  '19-divyang-lagna-sahay-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-19',
  '/attached_assets/documents/19-divyang-lagna-sahay-affidavit.docx',
  '19-divyang-lagna-sahay-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-20' WHERE title = 'ટ્રસ્ટ રાજીનામું/નવા ટ્રસ્ટીની નિમણૂક સ્વીકારવા અંગેનું સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'ટ્રસ્ટ રાજીનામું/નવા ટ્રસ્ટીની નિમણૂક સ્વીકારવા અંગેનું સોગંદનામું',
  'ટ્રસ્ટ રાજીનામું/નવા ટ્રસ્ટીની નિમણૂક સ્વીકારવા અંગેનું સોગંદનામું',
  '/attached_assets/documents/20-trust-rajinamu-affidavit.pdf',
  '20-trust-rajinamu-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-20',
  '/attached_assets/documents/20-trust-rajinamu-affidavit.docx',
  '20-trust-rajinamu-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-21' WHERE title = 'જમીન મહેસુલ રેકર્ડ — ગુજરેલ વારસદારનું નામ કમી કરવા સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'જમીન મહેસુલ રેકર્ડ — ગુજરેલ વારસદારનું નામ કમી કરવા સોગંદનામું',
  'જમીન મહેસુલ રેકર્ડ — ગુજરેલ વારસદારનું નામ કમી કરવા સોગંદનામું',
  '/attached_assets/documents/21-jamin-mahesul-varsai-name-update-affidavit.pdf',
  '21-jamin-mahesul-varsai-name-update-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-21',
  '/attached_assets/documents/21-jamin-mahesul-varsai-name-update-affidavit.docx',
  '21-jamin-mahesul-varsai-name-update-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-22' WHERE title = 'પતિ એકલો વારસદાર (પત્નીના મરણ પછી બેંક ખાતું) સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'પતિ એકલો વારસદાર (પત્નીના મરણ પછી બેંક ખાતું) સોગંદનામું',
  'પતિ એકલો વારસદાર (પત્નીના મરણ પછી બેંક ખાતું) સોગંદનામું',
  '/attached_assets/documents/22-pati-eklu-varsdar-bank-affidavit.pdf',
  '22-pati-eklu-varsdar-bank-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-22',
  '/attached_assets/documents/22-pati-eklu-varsdar-bank-affidavit.docx',
  '22-pati-eklu-varsdar-bank-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-23' WHERE title = 'માછીમારી બોટ (FRP OBM) — કેસ/દેવું ન હોવા બાહેંધરી' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'માછીમારી બોટ (FRP OBM) — કેસ/દેવું ન હોવા બાહેંધરી',
  'માછીમારી બોટ (FRP OBM) — કેસ/દેવું ન હોવા બાહેંધરી',
  '/attached_assets/documents/23-fishing-boat-bahendhari.pdf',
  '23-fishing-boat-bahendhari.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-23',
  '/attached_assets/documents/23-fishing-boat-bahendhari.docx',
  '23-fishing-boat-bahendhari.docx',
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
UPDATE documents SET group_id = 'affidavit-24' WHERE title = 'નવો વ્યવસાય — PGVCL વિજ કનેક્શન સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'નવો વ્યવસાય — PGVCL વિજ કનેક્શન સોગંદનામું',
  'નવો વ્યવસાય — PGVCL વિજ કનેક્શન સોગંદનામું',
  '/attached_assets/documents/24-navo-vyavsay-pgvcl-connection-affidavit.pdf',
  '24-navo-vyavsay-pgvcl-connection-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-24',
  '/attached_assets/documents/24-navo-vyavsay-pgvcl-connection-affidavit.docx',
  '24-navo-vyavsay-pgvcl-connection-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-25' WHERE title = 'માનસિક વિકલાંગ સંતાનના ગાર્ડિયન બનવા સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'માનસિક વિકલાંગ સંતાનના ગાર્ડિયન બનવા સોગંદનામું',
  'માનસિક વિકલાંગ સંતાનના ગાર્ડિયન બનવા સોગંદનામું',
  '/attached_assets/documents/25-guardian-viklang-santan-affidavit.pdf',
  '25-guardian-viklang-santan-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-25',
  '/attached_assets/documents/25-guardian-viklang-santan-affidavit.docx',
  '25-guardian-viklang-santan-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-26' WHERE title = 'કેન્સર/ગંભીર બિમારી સારવાર આવક સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'કેન્સર/ગંભીર બિમારી સારવાર આવક સોગંદનામું',
  'કેન્સર/ગંભીર બિમારી સારવાર આવક સોગંદનામું',
  '/attached_assets/documents/26-cancer-bimari-aavak-affidavit.pdf',
  '26-cancer-bimari-aavak-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-26',
  '/attached_assets/documents/26-cancer-bimari-aavak-affidavit.docx',
  '26-cancer-bimari-aavak-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-27' WHERE title = 'કૂવા/વિજ કનેક્શન — વારસદારો વચ્ચે વાંધા ન હોવા સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'કૂવા/વિજ કનેક્શન — વારસદારો વચ્ચે વાંધા ન હોવા સોગંદનામું',
  'કૂવા/વિજ કનેક્શન — વારસદારો વચ્ચે વાંધા ન હોવા સોગંદનામું',
  '/attached_assets/documents/27-kuva-vij-varsdar-no-dispute-affidavit.pdf',
  '27-kuva-vij-varsdar-no-dispute-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-27',
  '/attached_assets/documents/27-kuva-vij-varsdar-no-dispute-affidavit.docx',
  '27-kuva-vij-varsdar-no-dispute-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-28' WHERE title = 'પરિવારમાં જમીન હક-જતો સમાધાન સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'પરિવારમાં જમીન હક-જતો સમાધાન સોગંદનામું',
  'પરિવારમાં જમીન હક-જતો સમાધાન સોગંદનામું',
  '/attached_assets/documents/28-parivar-jamin-hakk-jato-affidavit.pdf',
  '28-parivar-jamin-hakk-jato-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-28',
  '/attached_assets/documents/28-parivar-jamin-hakk-jato-affidavit.docx',
  '28-parivar-jamin-hakk-jato-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-29' WHERE title = 'બ્લુ રીવોલ્યુશન યોજના — રેફ્રિજરેટર વાન સહાય સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'બ્લુ રીવોલ્યુશન યોજના — રેફ્રિજરેટર વાન સહાય સોગંદનામું',
  'બ્લુ રીવોલ્યુશન યોજના — રેફ્રિજરેટર વાન સહાય સોગંદનામું',
  '/attached_assets/documents/29-blue-revolution-van-affidavit.pdf',
  '29-blue-revolution-van-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-29',
  '/attached_assets/documents/29-blue-revolution-van-affidavit.docx',
  '29-blue-revolution-van-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-30' WHERE title = 'એપ્રેન્ટીસ તાલીમ — અગાઉ તાલીમ ના લીધા હોવા સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'એપ્રેન્ટીસ તાલીમ — અગાઉ તાલીમ ના લીધા હોવા સોગંદનામું',
  'એપ્રેન્ટીસ તાલીમ — અગાઉ તાલીમ ના લીધા હોવા સોગંદનામું',
  '/attached_assets/documents/30-apprentice-training-affidavit.pdf',
  '30-apprentice-training-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-30',
  '/attached_assets/documents/30-apprentice-training-affidavit.docx',
  '30-apprentice-training-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-31' WHERE title = 'વ્યવસાયનું નામ બદલવા બેંક ખાતામાં સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'વ્યવસાયનું નામ બદલવા બેંક ખાતામાં સોગંદનામું',
  'વ્યવસાયનું નામ બદલવા બેંક ખાતામાં સોગંદનામું',
  '/attached_assets/documents/31-business-naam-bank-badlav-affidavit.pdf',
  '31-business-naam-bank-badlav-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-31',
  '/attached_assets/documents/31-business-naam-bank-badlav-affidavit.docx',
  '31-business-naam-bank-badlav-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-32' WHERE title = 'શાળા છોડ્યાના પ્રમાણપત્રમાં જાતિ/પેટા-જાતિ કલમ સુધારો સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'શાળા છોડ્યાના પ્રમાણપત્રમાં જાતિ/પેટા-જાતિ કલમ સુધારો સોગંદનામું',
  'શાળા છોડ્યાના પ્રમાણપત્રમાં જાતિ/પેટા-જાતિ કલમ સુધારો સોગંદનામું',
  '/attached_assets/documents/32-shala-jaati-column-sudharo-affidavit.pdf',
  '32-shala-jaati-column-sudharo-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-32',
  '/attached_assets/documents/32-shala-jaati-column-sudharo-affidavit.docx',
  '32-shala-jaati-column-sudharo-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-33' WHERE title = 'ખેતીની જમીન — વારસદાર પુત્ર દ્વારા સ્વયં ખેડાણ સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'ખેતીની જમીન — વારસદાર પુત્ર દ્વારા સ્વયં ખેડાણ સોગંદનામું',
  'ખેતીની જમીન — વારસદાર પુત્ર દ્વારા સ્વયં ખેડાણ સોગંદનામું',
  '/attached_assets/documents/33-swayam-khedan-varsdar-affidavit.pdf',
  '33-swayam-khedan-varsdar-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-33',
  '/attached_assets/documents/33-swayam-khedan-varsdar-affidavit.docx',
  '33-swayam-khedan-varsdar-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-34' WHERE title = 'જન્મ પ્રમાણપત્રમાં પિતાના નામમાં સુધારો — અરજી' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'જન્મ પ્રમાણપત્રમાં પિતાના નામમાં સુધારો — અરજી',
  'જન્મ પ્રમાણપત્રમાં પિતાના નામમાં સુધારો — અરજી',
  '/attached_assets/documents/34-janma-pramanpatra-pita-naam-application.pdf',
  '34-janma-pramanpatra-pita-naam-application.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-34',
  '/attached_assets/documents/34-janma-pramanpatra-pita-naam-application.docx',
  '34-janma-pramanpatra-pita-naam-application.docx',
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
UPDATE documents SET group_id = 'affidavit-35' WHERE title = 'અંગુઠાના નિશાનની ઓળખ સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'અંગુઠાના નિશાનની ઓળખ સોગંદનામું',
  'અંગુઠાના નિશાનની ઓળખ સોગંદનામું',
  '/attached_assets/documents/35-angutha-nishan-olakh-affidavit.pdf',
  '35-angutha-nishan-olakh-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-35',
  '/attached_assets/documents/35-angutha-nishan-olakh-affidavit.docx',
  '35-angutha-nishan-olakh-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-36' WHERE title = 'મેડિકલ સ્ટોર/ફાર્મસી — રજિસ્ટર્ડ ફાર્માસિસ્ટ એફિડેવિટ' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'મેડિકલ સ્ટોર/ફાર્મસી — રજિસ્ટર્ડ ફાર્માસિસ્ટ એફિડેવિટ',
  'મેડિકલ સ્ટોર/ફાર્મસી — રજિસ્ટર્ડ ફાર્માસિસ્ટ એફિડેવિટ',
  '/attached_assets/documents/36-medical-store-pharmacist-affidavit.pdf',
  '36-medical-store-pharmacist-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-36',
  '/attached_assets/documents/36-medical-store-pharmacist-affidavit.docx',
  '36-medical-store-pharmacist-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-37' WHERE title = 'કર્મચારીના હાલના રહેઠાણની ખાત્રી સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'કર્મચારીના હાલના રહેઠાણની ખાત્રી સોગંદનામું',
  'કર્મચારીના હાલના રહેઠાણની ખાત્રી સોગંદનામું',
  '/attached_assets/documents/37-halnu-rahethan-sarnamu-affidavit.pdf',
  '37-halnu-rahethan-sarnamu-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-37',
  '/attached_assets/documents/37-halnu-rahethan-sarnamu-affidavit.docx',
  '37-halnu-rahethan-sarnamu-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-38' WHERE title = 'અપરણીત બિનવારસ સંબંધીના અવશાનનો દાખલો — અરજી' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'અપરણીત બિનવારસ સંબંધીના અવશાનનો દાખલો — અરજી',
  'અપરણીત બિનવારસ સંબંધીના અવશાનનો દાખલો — અરજી',
  '/attached_assets/documents/38-aparnit-binvaras-marran-dakhlo-application.pdf',
  '38-aparnit-binvaras-marran-dakhlo-application.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-38',
  '/attached_assets/documents/38-aparnit-binvaras-marran-dakhlo-application.docx',
  '38-aparnit-binvaras-marran-dakhlo-application.docx',
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
UPDATE documents SET group_id = 'affidavit-39' WHERE title = 'સેવાપોથી (સર્વિસ બુક) માં અટક સુધારો — પેન્શન સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'સેવાપોથી (સર્વિસ બુક) માં અટક સુધારો — પેન્શન સોગંદનામું',
  'સેવાપોથી (સર્વિસ બુક) માં અટક સુધારો — પેન્શન સોગંદનામું',
  '/attached_assets/documents/39-sevapothi-atak-sudharo-affidavit.pdf',
  '39-sevapothi-atak-sudharo-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-39',
  '/attached_assets/documents/39-sevapothi-atak-sudharo-affidavit.docx',
  '39-sevapothi-atak-sudharo-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-40' WHERE title = 'જમીન — બે અલગ ખાતા ભેગા કરવા (ખાતુ મર્જર) સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'જમીન — બે અલગ ખાતા ભેગા કરવા (ખાતુ મર્જર) સોગંદનામું',
  'જમીન — બે અલગ ખાતા ભેગા કરવા (ખાતુ મર્જર) સોગંદનામું',
  '/attached_assets/documents/40-jamin-khatu-merger-affidavit.pdf',
  '40-jamin-khatu-merger-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-40',
  '/attached_assets/documents/40-jamin-khatu-merger-affidavit.docx',
  '40-jamin-khatu-merger-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-41' WHERE title = 'યુનિવર્સિટી રેકોર્ડમાં ફોટોગ્રાફ અપડેટ સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'યુનિવર્સિટી રેકોર્ડમાં ફોટોગ્રાફ અપડેટ સોગંદનામું',
  'યુનિવર્સિટી રેકોર્ડમાં ફોટોગ્રાફ અપડેટ સોગંદનામું',
  '/attached_assets/documents/41-university-photo-update-affidavit.pdf',
  '41-university-photo-update-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-41',
  '/attached_assets/documents/41-university-photo-update-affidavit.docx',
  '41-university-photo-update-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-42' WHERE title = 'વિદ્યુત સહાયક ભરતી — નિમણૂંક સ્વીકારવા બાહેંધરી' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'વિદ્યુત સહાયક ભરતી — નિમણૂંક સ્વીકારવા બાહેંધરી',
  'વિદ્યુત સહાયક ભરતી — નિમણૂંક સ્વીકારવા બાહેંધરી',
  '/attached_assets/documents/42-vidyut-sahayak-bharti-bahendhari.pdf',
  '42-vidyut-sahayak-bharti-bahendhari.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-42',
  '/attached_assets/documents/42-vidyut-sahayak-bharti-bahendhari.docx',
  '42-vidyut-sahayak-bharti-bahendhari.docx',
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
UPDATE documents SET group_id = 'affidavit-43' WHERE title = 'ESIC — ડિપેન્ડન્ટ પેરેન્ટ સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'ESIC — ડિપેન્ડન્ટ પેરેન્ટ સોગંદનામું',
  'ESIC — ડિપેન્ડન્ટ પેરેન્ટ સોગંદનામું',
  '/attached_assets/documents/43-esic-dependent-parent-affidavit.pdf',
  '43-esic-dependent-parent-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-43',
  '/attached_assets/documents/43-esic-dependent-parent-affidavit.docx',
  '43-esic-dependent-parent-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-44' WHERE title = 'ડિગ્રી/પદવી પ્રમાણપત્ર ગુમ થયા બાબત સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'ડિગ્રી/પદવી પ્રમાણપત્ર ગુમ થયા બાબત સોગંદનામું',
  'ડિગ્રી/પદવી પ્રમાણપત્ર ગુમ થયા બાબત સોગંદનામું',
  '/attached_assets/documents/44-degree-certificate-gum-affidavit.pdf',
  '44-degree-certificate-gum-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-44',
  '/attached_assets/documents/44-degree-certificate-gum-affidavit.docx',
  '44-degree-certificate-gum-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-45' WHERE title = 'Single/Unmarried Status Declaration Affidavit (English)' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'Single/Unmarried Status Declaration Affidavit (English)',
  'Single/Unmarried Status Declaration Affidavit (English)',
  '/attached_assets/documents/45-single-unmarried-status-affidavit-EN.pdf',
  '45-single-unmarried-status-affidavit-EN.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-45',
  '/attached_assets/documents/45-single-unmarried-status-affidavit-EN.docx',
  '45-single-unmarried-status-affidavit-EN.docx',
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
UPDATE documents SET group_id = 'affidavit-46' WHERE title = 'Name/Surname Discrepancy Affidavit (English)' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'Name/Surname Discrepancy Affidavit (English)',
  'Name/Surname Discrepancy Affidavit (English)',
  '/attached_assets/documents/46-name-discrepancy-affidavit-EN.pdf',
  '46-name-discrepancy-affidavit-EN.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-46',
  '/attached_assets/documents/46-name-discrepancy-affidavit-EN.docx',
  '46-name-discrepancy-affidavit-EN.docx',
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
UPDATE documents SET group_id = 'affidavit-47' WHERE title = 'ધોરણ-8 પ્રવેશ માટે અભ્યાસ ગેપ (Study Gap Year) બાહેંધરી' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'ધોરણ-8 પ્રવેશ માટે અભ્યાસ ગેપ (Study Gap Year) બાહેંધરી',
  'ધોરણ-8 પ્રવેશ માટે અભ્યાસ ગેપ (Study Gap Year) બાહેંધરી',
  '/attached_assets/documents/47-abhyas-gap-varsh-bahendhari.pdf',
  '47-abhyas-gap-varsh-bahendhari.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-47',
  '/attached_assets/documents/47-abhyas-gap-varsh-bahendhari.docx',
  '47-abhyas-gap-varsh-bahendhari.docx',
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
UPDATE documents SET group_id = 'affidavit-48' WHERE title = 'સ્વાતંત્ર્ય સેનાની/શહીદ વારસદારો — હાઉસ ટેક્સ માફી સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'સ્વાતંત્ર્ય સેનાની/શહીદ વારસદારો — હાઉસ ટેક્સ માફી સોગંદનામું',
  'સ્વાતંત્ર્ય સેનાની/શહીદ વારસદારો — હાઉસ ટેક્સ માફી સોગંદનામું',
  '/attached_assets/documents/48-swatantra-senani-house-tax-mafi-affidavit.pdf',
  '48-swatantra-senani-house-tax-mafi-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-48',
  '/attached_assets/documents/48-swatantra-senani-house-tax-mafi-affidavit.docx',
  '48-swatantra-senani-house-tax-mafi-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-49' WHERE title = 'ભૂમિહીન ખેતમજૂર દાખલો સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'ભૂમિહીન ખેતમજૂર દાખલો સોગંદનામું',
  'ભૂમિહીન ખેતમજૂર દાખલો સોગંદનામું',
  '/attached_assets/documents/49-bhoomihin-khetmajur-dakhlo-affidavit.pdf',
  '49-bhoomihin-khetmajur-dakhlo-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-49',
  '/attached_assets/documents/49-bhoomihin-khetmajur-dakhlo-affidavit.docx',
  '49-bhoomihin-khetmajur-dakhlo-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-50' WHERE title = 'પેન્શનર મરણ પછી બાકી પગાર/એરિયર્સ — અન્ય વારસદારોની સંમતિ સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'પેન્શનર મરણ પછી બાકી પગાર/એરિયર્સ — અન્ય વારસદારોની સંમતિ સોગંદનામું',
  'પેન્શનર મરણ પછી બાકી પગાર/એરિયર્સ — અન્ય વારસદારોની સંમતિ સોગંદનામું',
  '/attached_assets/documents/50-pensioner-arrears-consent-affidavit.pdf',
  '50-pensioner-arrears-consent-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-50',
  '/attached_assets/documents/50-pensioner-arrears-consent-affidavit.docx',
  '50-pensioner-arrears-consent-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-51' WHERE title = 'બાલિકા સમૃદ્ધિ યોજના ખાતામાંથી ભૂલથી જમા થયેલ રકમ ઉપાડવા સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'બાલિકા સમૃદ્ધિ યોજના ખાતામાંથી ભૂલથી જમા થયેલ રકમ ઉપાડવા સોગંદનામું',
  'બાલિકા સમૃદ્ધિ યોજના ખાતામાંથી ભૂલથી જમા થયેલ રકમ ઉપાડવા સોગંદનામું',
  '/attached_assets/documents/51-balika-samruddhi-rakam-upad-affidavit.pdf',
  '51-balika-samruddhi-rakam-upad-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-51',
  '/attached_assets/documents/51-balika-samruddhi-rakam-upad-affidavit.docx',
  '51-balika-samruddhi-rakam-upad-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-52' WHERE title = 'કૌટુંબિક હિસ્સા વહેંચણી સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'કૌટુંબિક હિસ્સા વહેંચણી સોગંદનામું',
  'કૌટુંબિક હિસ્સા વહેંચણી સોગંદનામું',
  '/attached_assets/documents/52-koutumbik-hissa-vahenchani-affidavit.pdf',
  '52-koutumbik-hissa-vahenchani-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-52',
  '/attached_assets/documents/52-koutumbik-hissa-vahenchani-affidavit.docx',
  '52-koutumbik-hissa-vahenchani-affidavit.docx',
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
UPDATE documents SET group_id = 'affidavit-53' WHERE title = 'માતા-પિતાના મરણ પ્રમાણપત્ર ના મળવા છતાં અવશાન અંગેનું સોગંદનામું' AND (group_id IS NULL OR group_id = '');

-- Upsert: insert if not exists, update in-place if group_id matches
INSERT INTO documents (title, description, file_url, file_name, file_type, category, is_prime, access_level, group_id, word_url, word_file_name, created_at)
VALUES (
  'માતા-પિતાના મરણ પ્રમાણપત્ર ના મળવા છતાં અવશાન અંગેનું સોગંદનામું',
  'માતા-પિતાના મરણ પ્રમાણપત્ર ના મળવા છતાં અવશાન અંગેનું સોગંદનામું',
  '/attached_assets/documents/53-matapita-marran-pramanpatra-medical-affidavit.pdf',
  '53-matapita-marran-pramanpatra-medical-affidavit.pdf',
  'PDF',
  'Affidavits',
  true,
  'login_required',
  'affidavit-53',
  '/attached_assets/documents/53-matapita-marran-pramanpatra-medical-affidavit.docx',
  '53-matapita-marran-pramanpatra-medical-affidavit.docx',
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