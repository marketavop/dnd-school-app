-- Isolated disposable Supabase/PostgreSQL database only; run after all migrations.
-- Fixtures and visibility changes are rolled back. Never run on production.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO app_private.users(id, username, password_hash, role) VALUES
 ('6e010000-0000-0000-0000-000000000011', 'section-test-player', extensions.crypt('test-password', extensions.gen_salt('bf', 4)), 'player'),
 ('6e010000-0000-0000-0000-000000000012', 'section-test-leader', extensions.crypt('test-password', extensions.gen_salt('bf', 4)), 'leader');
CREATE TEMP TABLE section_test_tokens AS
 SELECT 'player' AS role, session_token FROM public.login('section-test-player', 'test-password')
 UNION ALL SELECT 'leader', session_token FROM public.login('section-test-leader', 'test-password');
GRANT SELECT ON section_test_tokens TO anon;

DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
   IF has_table_privilege(role_name, 'app_private.character_section_visibility', 'SELECT')
      OR has_table_privilege(role_name, 'app_private.character_section_visibility', 'INSERT')
      OR has_table_privilege(role_name, 'app_private.character_section_visibility', 'UPDATE')
      OR has_table_privilege(role_name, 'app_private.character_section_visibility', 'DELETE') THEN
     RAISE EXCEPTION 'Direct visibility table access remains for %', role_name;
   END IF;
   IF has_function_privilege(role_name, 'public.leader_set_character_section_visibility(text,text,boolean)', 'EXECUTE') THEN
     RAISE EXCEPTION 'Client can execute visibility setter: %', role_name;
   END IF;
 END LOOP;
END $$;

SET LOCAL ROLE anon;
DO $$ DECLARE player_token text; leader_token text; r record; BEGIN
 SELECT session_token INTO STRICT player_token FROM section_test_tokens WHERE role = 'player';
 SELECT session_token INTO STRICT leader_token FROM section_test_tokens WHERE role = 'leader';
 SELECT * INTO STRICT r FROM public.character_section_visibility(player_token) WHERE section_id = 'abilities';
 IF r.is_visible IS DISTINCT FROM true THEN RAISE EXCEPTION 'abilities must default visible'; END IF;
 IF EXISTS (SELECT FROM public.character_section_visibility('invalid-session')) THEN
   RAISE EXCEPTION 'Invalid session accepted';
 END IF;
 BEGIN
   PERFORM * FROM public.leader_set_character_section_visibility(player_token, 'abilities', false);
   RAISE EXCEPTION 'Player visibility change accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT * INTO STRICT r FROM public.leader_set_character_section_visibility(leader_token, 'abilities', false);
 IF r.is_visible IS DISTINCT FROM false THEN RAISE EXCEPTION 'Leader change failed'; END IF;
 SELECT * INTO STRICT r FROM public.leader_set_character_section_visibility(leader_token, 'inventory', true);
 IF r.section_id <> 'inventory' THEN RAISE EXCEPTION 'New section upsert failed'; END IF;
 SELECT * INTO STRICT r FROM public.character_section_visibility(player_token) WHERE section_id = 'inventory';
 IF r.is_visible IS DISTINCT FROM true THEN RAISE EXCEPTION 'Shared setting not visible to player'; END IF;
 BEGIN
   UPDATE app_private.character_section_visibility SET is_visible = false WHERE section_id = 'abilities';
   RAISE EXCEPTION 'Direct table update accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'PASS: shared character section visibility authorization/defaults (rolled back)'
