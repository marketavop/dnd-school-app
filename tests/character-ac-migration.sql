-- Run with psql as the migration owner after all migrations, on a test database.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.characters(id, name) VALUES
 ('6d000000-0000-0000-0000-000000000001', 'AC own'),
 ('6d000000-0000-0000-0000-000000000002', 'AC foreign');
INSERT INTO app_private.users(id, username, password_hash, role) VALUES
 ('6d000000-0000-0000-0000-000000000011', 'ac-test-player', extensions.crypt('test-password', extensions.gen_salt('bf', 4)), 'player'),
 ('6d000000-0000-0000-0000-000000000012', 'ac-test-leader', extensions.crypt('test-password', extensions.gen_salt('bf', 4)), 'leader');
INSERT INTO app_private.user_characters(user_id, character_id) VALUES
 ('6d000000-0000-0000-0000-000000000011', '6d000000-0000-0000-0000-000000000001');
CREATE TEMP TABLE ac_tokens AS
 SELECT 'player' AS role, session_token FROM public.login('ac-test-player', 'test-password')
 UNION ALL SELECT 'leader', session_token FROM public.login('ac-test-leader', 'test-password');
GRANT SELECT ON ac_tokens TO anon;
SET LOCAL ROLE anon;
DO $$
DECLARE t text; leader_token text; r record; patch jsonb;
  own_id constant uuid := '6d000000-0000-0000-0000-000000000001';
  foreign_id constant uuid := '6d000000-0000-0000-0000-000000000002';
BEGIN
 SELECT session_token INTO STRICT t FROM ac_tokens WHERE role = 'player';
 SELECT session_token INTO STRICT leader_token FROM ac_tokens WHERE role = 'leader';
 PERFORM public.player_update_character(t, own_id, '{"ac":15}');
 PERFORM public.player_update_character(t, own_id, '{"ac_note":"kožená zbroj + obratnost"}');
 SELECT * INTO STRICT r FROM public.player_character(t, own_id);
 IF r.ac IS DISTINCT FROM 15 OR r.ac_note IS DISTINCT FROM 'kožená zbroj + obratnost' THEN
   RAISE EXCEPTION 'AC read after write failed';
 END IF;
 SELECT * INTO STRICT r FROM public.leader_character(leader_token, own_id);
 IF r.ac IS DISTINCT FROM 15 OR r.ac_note IS DISTINCT FROM 'kožená zbroj + obratnost' THEN
   RAISE EXCEPTION 'Leader AC read failed';
 END IF;
 FOREACH patch IN ARRAY ARRAY['{"ac":16}'::jsonb, '{"ac":100}', '{"ac":0}', '{"ac":null}'] LOOP
   PERFORM public.player_update_character(t, own_id, patch);
   SELECT * INTO STRICT r FROM public.player_character(t, own_id);
   IF r.ac IS DISTINCT FROM (patch->>'ac')::integer THEN RAISE EXCEPTION 'AC value not persisted'; END IF;
 END LOOP;
 BEGIN
   PERFORM public.player_update_character(t, own_id, '{"ac":-1}');
   RAISE EXCEPTION 'Negative AC accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
   PERFORM public.player_update_character(t, own_id, '{"ac":1.5}');
   RAISE EXCEPTION 'Fractional AC accepted';
 EXCEPTION WHEN invalid_text_representation THEN NULL; END;
 FOREACH patch IN ARRAY ARRAY['{"ac":17}'::jsonb, '{"ac_note":"foreign write"}'] LOOP
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
     RAISE EXCEPTION 'Leader write accepted';
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 BEGIN
   UPDATE public.characters SET ac = 17 WHERE id = foreign_id;
   RAISE EXCEPTION 'Direct UPDATE accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT * INTO STRICT r FROM public.player_character(t, own_id);
 IF r.ac IS NOT NULL THEN RAISE EXCEPTION 'Rejected write changed AC'; END IF;
 PERFORM public.player_update_character(t, own_id, '{"ac_note":null}');
 SELECT * INTO STRICT r FROM public.player_character(t, own_id);
 IF r.ac_note IS NOT NULL THEN RAISE EXCEPTION 'NULL note not persisted'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
