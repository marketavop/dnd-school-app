-- Run with psql as migration owner after all migrations, on a disposable test DB.
-- Fixtures and all mutations are rolled back. No Storage objects are uploaded.
-- SQL Editor: omit the psql-only \set line and run the entire transaction as postgres.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.characters(id, name) VALUES
 ('71000000-0000-0000-0000-000000000001', 'Portrait own'),
 ('71000000-0000-0000-0000-000000000002', 'Portrait unowned'),
 ('71000000-0000-0000-0000-000000000003', 'Portrait player B');
INSERT INTO app_private.users(id, username, password_hash, role) VALUES
 ('71000000-0000-0000-0000-000000000011', 'portrait-test-player', extensions.crypt('test-password', extensions.gen_salt('bf', 12)), 'player'),
 ('71000000-0000-0000-0000-000000000012', 'portrait-test-leader', extensions.crypt('test-password', extensions.gen_salt('bf', 12)), 'leader'),
 ('71000000-0000-0000-0000-000000000013', 'portrait-test-player-b', extensions.crypt('test-password', extensions.gen_salt('bf', 12)), 'player');
INSERT INTO app_private.user_characters(user_id, character_id) VALUES
 ('71000000-0000-0000-0000-000000000011', '71000000-0000-0000-0000-000000000001'),
 ('71000000-0000-0000-0000-000000000013', '71000000-0000-0000-0000-000000000003');
INSERT INTO app_private.npcs(id, name) VALUES ('71000000-0000-0000-0000-000000000021', 'Portrait NPC');
CREATE TEMP TABLE portrait_test_tokens AS
 SELECT 'player' AS role, session_token FROM public.login('portrait-test-player', 'test-password')
 UNION ALL SELECT 'leader', session_token FROM public.login('portrait-test-leader', 'test-password');
GRANT SELECT ON portrait_test_tokens TO anon, authenticated, service_role;

DO $$
DECLARE b record; role_name text; signature text; bad text;
BEGIN
 SELECT * INTO STRICT b FROM storage.buckets WHERE id = 'portraits';
 IF b.public IS DISTINCT FROM false OR b.file_size_limit IS DISTINCT FROM 5242880::bigint
   OR NOT (b.allowed_mime_types @> ARRAY['image/jpeg','image/png','image/webp']
     AND b.allowed_mime_types <@ ARRAY['image/jpeg','image/png','image/webp'])
   OR b.allowed_mime_types IS NULL THEN RAISE EXCEPTION 'Wrong bucket settings'; END IF;
 FOREACH signature IN ARRAY ARRAY[
   'public.portrait_reference(text,text,uuid,boolean,text)',
   'public.portrait_change_reference(text,text,uuid,text,text)'] LOOP
   FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
     IF has_function_privilege(role_name, signature, 'EXECUTE') THEN
       RAISE EXCEPTION 'Client can execute %', signature;
     END IF;
   END LOOP;
   IF NOT has_function_privilege('service_role', signature, 'EXECUTE') THEN
     RAISE EXCEPTION 'Service cannot execute %', signature;
   END IF;
   IF EXISTS (SELECT FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = signature::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
     RAISE EXCEPTION 'PUBLIC grant on %', signature;
   END IF;
 END LOOP;
 -- Direct table constraints must work independently of RPC authorization.
 FOREACH bad IN ARRAY ARRAY[
   '', 'https://example.com/a.png',
   'characters/71000000-0000-0000-0000-000000000002/71000000-0000-0000-0000-000000000031.jpg',
   'npcs/71000000-0000-0000-0000-000000000001/71000000-0000-0000-0000-000000000031.png',
   'characters/71000000-0000-0000-0000-000000000001/../a.png',
   'characters/71000000-0000-0000-0000-000000000001/71000000-0000-0000-0000-000000000031.svg'] LOOP
   BEGIN
     UPDATE public.characters SET portrait_path = bad WHERE id = '71000000-0000-0000-0000-000000000001';
     RAISE EXCEPTION 'Invalid character path accepted: %', bad;
   EXCEPTION WHEN check_violation THEN NULL; END;
 END LOOP;
 FOREACH bad IN ARRAY ARRAY['', 'https://example.com/a.png',
   'npcs/71000000-0000-0000-0000-000000000022/71000000-0000-0000-0000-000000000031.png',
   'characters/71000000-0000-0000-0000-000000000021/71000000-0000-0000-0000-000000000031.png',
   'npcs/71000000-0000-0000-0000-000000000021/not-a-uuid.webp'] LOOP
   BEGIN
     UPDATE app_private.npcs SET image_url = bad WHERE id = '71000000-0000-0000-0000-000000000021';
     RAISE EXCEPTION 'Invalid NPC path accepted: %', bad;
   EXCEPTION WHEN check_violation THEN NULL; END;
 END LOOP;
END $$;

SET LOCAL ROLE service_role;
DO $$
DECLARE t text; lt text; r record; ext text;
 own_id constant uuid := '71000000-0000-0000-0000-000000000001';
 other_id constant uuid := '71000000-0000-0000-0000-000000000002';
 npc_id constant uuid := '71000000-0000-0000-0000-000000000021';
 path text; previous text := NULL;
 npc_path constant text := 'npcs/71000000-0000-0000-0000-000000000021/71000000-0000-0000-0000-000000000031.png';
BEGIN
 SELECT session_token INTO STRICT t FROM portrait_test_tokens WHERE role = 'player';
 SELECT session_token INTO STRICT lt FROM portrait_test_tokens WHERE role = 'leader';
 SELECT * INTO STRICT r FROM public.portrait_reference(t, 'character', own_id);
 IF r.object_path IS NOT NULL THEN RAISE EXCEPTION 'Initial NULL lost'; END IF;
 FOREACH ext IN ARRAY ARRAY['jpg','png','webp'] LOOP
   path := 'characters/' || own_id || '/71000000-0000-0000-0000-000000000031.' || ext;
   SELECT * INTO STRICT r FROM public.portrait_change_reference(t, 'character', own_id, previous, path);
   IF r.old_path IS DISTINCT FROM previous OR r.new_path IS DISTINCT FROM path THEN
     RAISE EXCEPTION 'Wrong change result'; END IF;
   SELECT * INTO STRICT r FROM public.portrait_reference(t, 'character', own_id, true);
   IF r.object_path IS DISTINCT FROM path THEN RAISE EXCEPTION 'Write not persisted'; END IF;
   previous := path;
 END LOOP;
 BEGIN
   PERFORM public.portrait_change_reference(t, 'character', own_id, NULL, NULL);
   RAISE EXCEPTION 'Stale expected value accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 SELECT * INTO STRICT r FROM public.portrait_reference(t, 'character', own_id);
 IF r.object_path IS DISTINCT FROM path THEN RAISE EXCEPTION 'Conflict changed reference'; END IF;
 BEGIN
   PERFORM public.portrait_change_reference(t, 'character', '71000000-0000-0000-0000-000000000003', NULL,
     'characters/71000000-0000-0000-0000-000000000003/71000000-0000-0000-0000-000000000031.jpg');
   RAISE EXCEPTION 'Player A changed player B character';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.portrait_change_reference(t, 'character', other_id, NULL, NULL);
   RAISE EXCEPTION 'Unowned character write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.portrait_reference(t, 'character', other_id, true);
   RAISE EXCEPTION 'Foreign upload authorization accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.portrait_change_reference(t, 'npc', npc_id, NULL, npc_path);
   RAISE EXCEPTION 'Player NPC write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.portrait_reference(t, 'npc', npc_id);
   RAISE EXCEPTION 'Unplaced NPC read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.portrait_change_reference('invalid-token', 'character', own_id, path, NULL);
   RAISE EXCEPTION 'Invalid session accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.portrait_change_reference(lt, 'character', '71000000-0000-0000-0000-000000000099', NULL, NULL);
   RAISE EXCEPTION 'Missing entity accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.portrait_change_reference(t, 'character', own_id, path, NULL);
 SELECT * INTO STRICT r FROM public.portrait_reference(t, 'character', own_id);
 IF r.object_path IS NOT NULL THEN RAISE EXCEPTION 'Removal failed'; END IF;
 -- Leader can change even an unowned character, as required by IMG-01.
 path := 'characters/' || other_id || '/71000000-0000-0000-0000-000000000031.jpg';
 PERFORM public.portrait_change_reference(lt, 'character', other_id, NULL, path);
 SELECT * INTO STRICT r FROM public.portrait_reference(lt, 'character', other_id);
 IF r.object_path IS DISTINCT FROM path THEN RAISE EXCEPTION 'Leader character write failed'; END IF;
 PERFORM public.portrait_change_reference(lt, 'character', other_id, path, NULL);
 PERFORM public.portrait_change_reference(lt, 'npc', npc_id, NULL, npc_path);
 SELECT * INTO STRICT r FROM public.portrait_reference(lt, 'npc', npc_id);
 IF r.object_path IS DISTINCT FROM npc_path THEN RAISE EXCEPTION 'Leader NPC write failed'; END IF;
 PERFORM public.portrait_change_reference(lt, 'npc', npc_id, npc_path, NULL);
 SELECT * INTO STRICT r FROM public.portrait_reference(lt, 'npc', npc_id);
 IF r.object_path IS NOT NULL THEN RAISE EXCEPTION 'NPC removal failed'; END IF;
END $$;
RESET ROLE;
-- Seeded maps come from leader_maps; explicitly prepare the singleton game state.
-- Both INSERT and an existing row's UPDATE roll back with the test.
INSERT INTO public.game_state(id, active_map_id) VALUES (1, 'test-map')
 ON CONFLICT (id) DO UPDATE SET active_map_id = EXCLUDED.active_map_id;
INSERT INTO public.token_positions(character_id, map_id, x, y) VALUES
 ('71000000-0000-0000-0000-000000000003', 'test-map', 50, 50),
 ('71000000-0000-0000-0000-000000000003', 'mapa-akademie', 50, 50);
INSERT INTO app_private.npc_placements(npc_id, map_id, x, y, visible)
 VALUES ('71000000-0000-0000-0000-000000000021', 'test-map', 50, 50, true),
 ('71000000-0000-0000-0000-000000000021', 'mapa-akademie', 50, 50, true);
SET LOCAL ROLE service_role;
DO $$ DECLARE t text; r record; BEGIN
 SELECT session_token INTO STRICT t FROM portrait_test_tokens WHERE role = 'player';
 -- A sees B on the active map; a placement on an inactive map grants no read.
 SELECT * INTO STRICT r FROM public.portrait_reference(t, 'character', '71000000-0000-0000-0000-000000000003', false, 'test-map');
 BEGIN
   PERFORM public.portrait_reference(t, 'character', '71000000-0000-0000-0000-000000000003', false, 'mapa-akademie');
   RAISE EXCEPTION 'Foreign character on inactive map readable';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT * INTO STRICT r FROM public.portrait_reference(t, 'npc', '71000000-0000-0000-0000-000000000021', false, 'test-map');
 BEGIN
   PERFORM public.portrait_reference(t, 'npc', '71000000-0000-0000-0000-000000000021', true, 'test-map');
   RAISE EXCEPTION 'Visible NPC grants write access';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.portrait_reference(t, 'npc', '71000000-0000-0000-0000-000000000021', false, 'mapa-akademie');
   RAISE EXCEPTION 'Inactive map read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DELETE FROM public.token_positions
 WHERE character_id = '71000000-0000-0000-0000-000000000003' AND map_id = 'test-map';
UPDATE app_private.npc_placements SET visible = false WHERE npc_id = '71000000-0000-0000-0000-000000000021';
DELETE FROM app_private.user_characters WHERE user_id = '71000000-0000-0000-0000-000000000011';
SET LOCAL ROLE service_role;
DO $$ DECLARE t text; BEGIN
 SELECT session_token INTO STRICT t FROM portrait_test_tokens WHERE role = 'player';
 BEGIN
   PERFORM public.portrait_reference(t, 'character', '71000000-0000-0000-0000-000000000003', false, 'test-map');
   RAISE EXCEPTION 'Foreign character readable after removal from active map';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.portrait_reference(t, 'npc', '71000000-0000-0000-0000-000000000021', false, 'test-map');
   RAISE EXCEPTION 'Hidden NPC read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.portrait_change_reference(t, 'character', '71000000-0000-0000-0000-000000000001', NULL, NULL);
   RAISE EXCEPTION 'Revoked ownership accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO app_private.user_characters(user_id, character_id) VALUES
 ('71000000-0000-0000-0000-000000000011', '71000000-0000-0000-0000-000000000001');

SET LOCAL ROLE anon;
DO $$
DECLARE t text; lt text; bad text; created uuid; r record;
BEGIN
 SELECT session_token INTO STRICT t FROM portrait_test_tokens WHERE role = 'player';
 SELECT session_token INTO STRICT lt FROM portrait_test_tokens WHERE role = 'leader';
 BEGIN
   PERFORM public.portrait_change_reference(lt, 'npc', '71000000-0000-0000-0000-000000000021', NULL, NULL);
   RAISE EXCEPTION 'Anon internal write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.player_update_character(t, '71000000-0000-0000-0000-000000000001', '{"portrait_path":null}');
   RAISE EXCEPTION 'General portrait update accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.player_update_character(t, '71000000-0000-0000-0000-000000000001', '{"ac":12}');
 SELECT * INTO STRICT r FROM public.player_character(t, '71000000-0000-0000-0000-000000000001');
 IF r.ac IS DISTINCT FROM 12 THEN RAISE EXCEPTION 'Other character edits broken'; END IF;
 FOREACH bad IN ARRAY ARRAY['https://example.com/a.png', '',
   'npcs/71000000-0000-0000-0000-000000000021/71000000-0000-0000-0000-000000000031.jpg'] LOOP
   BEGIN
     PERFORM public.leader_create_npc(lt, 'Rejected portrait NPC', bad);
     RAISE EXCEPTION 'NPC image argument accepted';
   EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 END LOOP;
 created := public.leader_create_npc(lt, 'New portrait NPC', NULL);
 SELECT * INTO STRICT r FROM public.leader_npcs(lt) WHERE id = created;
 IF r.image_url IS NOT NULL THEN RAISE EXCEPTION 'New NPC has image'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ DECLARE lt text; BEGIN
 SELECT session_token INTO STRICT lt FROM portrait_test_tokens WHERE role = 'leader';
 BEGIN
   PERFORM public.portrait_change_reference(lt, 'npc', '71000000-0000-0000-0000-000000000021', NULL, NULL);
   RAISE EXCEPTION 'Authenticated internal write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.portrait_reference(lt, 'npc', '71000000-0000-0000-0000-000000000021', true);
   RAISE EXCEPTION 'Authenticated internal read accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
