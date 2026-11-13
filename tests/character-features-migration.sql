-- Features: run ONLY on an isolated test DB after all migrations, as migration owner.
-- psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/character-content-migration.sql
-- Do not run against production. Fixtures and writes are rolled back.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.characters(id, name, level, current_hp, max_hp, ac, ac_note) VALUES
 ('6d010000-0000-0000-0000-000000000001', 'Content own', 3, 8, 10, 12, 'Keep AC note'),
 ('6d010000-0000-0000-0000-000000000002', 'Content foreign', 2, 5, 6, 11, 'Foreign AC');
INSERT INTO app_private.users(id, username, password_hash, role) VALUES
 ('6d010000-0000-0000-0000-000000000011', 'content-test-player', extensions.crypt('test-password', extensions.gen_salt('bf', 4)), 'player'),
 ('6d010000-0000-0000-0000-000000000012', 'content-test-leader', extensions.crypt('test-password', extensions.gen_salt('bf', 4)), 'leader'),
 ('6d010000-0000-0000-0000-000000000013', 'content-test-other', extensions.crypt('test-password', extensions.gen_salt('bf', 4)), 'player');
INSERT INTO app_private.user_characters(user_id, character_id) VALUES
 ('6d010000-0000-0000-0000-000000000011', '6d010000-0000-0000-0000-000000000001'),
 ('6d010000-0000-0000-0000-000000000013', '6d010000-0000-0000-0000-000000000002');
CREATE TEMP TABLE content_tokens AS
 SELECT 'player' AS role, session_token FROM public.login('content-test-player', 'test-password')
 UNION ALL SELECT 'leader', session_token FROM public.login('content-test-leader', 'test-password');
GRANT SELECT ON content_tokens TO anon;
DO $ DECLARE signature text; role_name text; BEGIN
 FOREACH signature IN ARRAY ARRAY['public.player_character(text,uuid)', 'public.player_update_character(text,uuid,jsonb)', 'public.leader_character(text,uuid)'] LOOP
   IF NOT has_function_privilege('anon', signature, 'EXECUTE')
      OR NOT has_function_privilege('service_role', signature, 'EXECUTE')
      OR has_function_privilege('authenticated', signature, 'EXECUTE') THEN
     RAISE EXCEPTION 'RPC grants changed: %', signature;
   END IF;
 END LOOP;
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_table_privilege(role_name,'public.characters','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
     RAISE EXCEPTION 'Direct table access granted: %', role_name;
   END IF;
 END LOOP;
END $;
SET LOCAL ROLE anon;
DO $$
DECLARE t text; leader_token text; bad jsonb; patch jsonb; value jsonb;
 before_row jsonb; actual jsonb; returned_row jsonb; before_rejections jsonb;
 own_id constant uuid := '6d010000-0000-0000-0000-000000000001';
 foreign_id constant uuid := '6d010000-0000-0000-0000-000000000002';
BEGIN
 SELECT session_token INTO STRICT t FROM content_tokens WHERE role = 'player';
 SELECT session_token INTO STRICT leader_token FROM content_tokens WHERE role = 'leader';
 SELECT to_jsonb(r) INTO STRICT actual FROM public.player_character(t, own_id) r;
 IF actual->'features' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'Default must be []'; END IF;
 FOREACH value IN ARRAY ARRAY[
   '[{"name":"Darkvision","note":""},{"name":"Magic","note":"Own note"}]'::jsonb,
   (SELECT jsonb_agg(jsonb_build_object('name', repeat('ž',100), 'note', repeat('ž',2000))) FROM generate_series(1,100)),
   '[]'::jsonb, '[{"name":"Preserve me","note":"Across unrelated updates"}]'::jsonb
 ] LOOP
   SELECT to_jsonb(r) INTO STRICT before_row FROM public.player_character(t, own_id) r;
   SELECT to_jsonb(r) INTO STRICT returned_row FROM public.player_update_character(t, own_id, jsonb_build_object('features',value)) r;
   SELECT to_jsonb(r) INTO STRICT actual FROM public.player_character(t, own_id) r;
   IF actual IS DISTINCT FROM (before_row || jsonb_build_object('features',value)) OR returned_row IS DISTINCT FROM actual THEN
     RAISE EXCEPTION 'Features roundtrip or field isolation failed';
   END IF;
   SELECT to_jsonb(r) INTO STRICT returned_row FROM public.leader_character(leader_token, own_id) r;
   IF returned_row IS DISTINCT FROM (actual - 'user_id') THEN RAISE EXCEPTION 'Leader read failed'; END IF;
 END LOOP;
 FOREACH bad IN ARRAY ARRAY[
   'null'::jsonb, '{}', 'true', '1', '"text"', '[null]', '[1]', '[[]]', '[{}]',
   '[{"name":"x"}]', '[{"note":"x"}]', '[{"name":null,"note":""}]',
   '[{"name":1,"note":""}]', '[{"name":"x","note":false}]',
   '[{"name":"x","note":null}]', '[{"name":"x","note":[]}]',
   '[{"name":"x","note":{}}]', '[{"name":"x","note":"","extra":1}]',
   '[{"name":"","note":""}]', jsonb_build_array(jsonb_build_object('name', E' \n\t', 'note','')),
   jsonb_build_array(jsonb_build_object('name',repeat('ž',101),'note','')),
   jsonb_build_array(jsonb_build_object('name','x','note',repeat('ž',2001))),
   (SELECT jsonb_agg(jsonb_build_object('name','x','note','')) FROM generate_series(1,101)),
   '[{"name":"valid","note":""},{"name":"","note":""}]'
 ] LOOP
   BEGIN
     PERFORM public.player_update_character(t, own_id, jsonb_build_object('features',bad));
     RAISE EXCEPTION 'Invalid features accepted: %', bad;
   EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 patch := '{"features":[{"name":"Denied","note":""}]}';
 BEGIN
   PERFORM public.player_update_character(t, foreign_id, patch);
   RAISE EXCEPTION 'Foreign update accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.player_update_character('invalid-token', own_id, patch);
   RAISE EXCEPTION 'Invalid session accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.player_update_character(leader_token, own_id, patch);
   RAISE EXCEPTION 'Leader update accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT to_jsonb(r) INTO STRICT before_rejections FROM public.player_character(t, own_id) r;
 IF before_rejections IS DISTINCT FROM actual THEN RAISE EXCEPTION 'Rejected write changed data'; END IF;
 FOREACH patch IN ARRAY ARRAY['{"portrait_path":null}'::jsonb, '{"portrait_path":"characters/blocked.png"}',
   '{"unknown":"blocked"}', '{"id":null}', '{"user_id":null}',
   '{"background":"a","notes":"b"}', '{"features":[],"name":"blocked"}', '{}', 'null', '[]'] LOOP
   BEGIN
     PERFORM public.player_update_character(t, own_id, patch);
     RAISE EXCEPTION 'Forbidden patch accepted: %', patch;
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 BEGIN
   PERFORM public.player_character(t, foreign_id);
   RAISE EXCEPTION 'Foreign read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.player_character('invalid-token', own_id);
   RAISE EXCEPTION 'Invalid session read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.leader_character(t, own_id);
   RAISE EXCEPTION 'Player used leader read';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.leader_character('invalid-token', own_id);
   RAISE EXCEPTION 'Invalid leader session accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM * FROM public.characters WHERE id = own_id;
   RAISE EXCEPTION 'Direct SELECT accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   UPDATE public.characters SET features = '[]' WHERE id = own_id;
   RAISE EXCEPTION 'Direct UPDATE accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT to_jsonb(r) INTO STRICT actual FROM public.player_character(t, own_id) r;
 IF actual IS DISTINCT FROM before_rejections THEN RAISE EXCEPTION 'Forbidden patch changed data'; END IF;
 SELECT to_jsonb(r) INTO STRICT actual FROM public.leader_character(leader_token, foreign_id) r;
 IF actual->'background' <> 'null'::jsonb OR actual->'inventory' <> 'null'::jsonb OR actual->'notes' <> 'null'::jsonb THEN
   RAISE EXCEPTION 'Foreign content changed';
 END IF;
 -- Existing atomic HP correction must survive the updater replacement.
 PERFORM public.player_update_character(t, own_id, '{"max_hp":4}');
 SELECT to_jsonb(r) INTO STRICT actual FROM public.player_character(t, own_id) r;
 IF actual IS DISTINCT FROM (before_rejections || '{"max_hp":4,"current_hp":4}'::jsonb) THEN
   RAISE EXCEPTION 'Existing HP behavior or content preservation changed';
 END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'PASS: character features contract (rolled back)'
