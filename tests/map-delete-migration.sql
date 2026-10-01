-- EMPTY disposable PostgreSQL database only. Never run against production.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA app_private;
-- Session fixture isolates delete authorization from the existing login tests.
CREATE FUNCTION app_private.require_session(token text, required_role text)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF token IS DISTINCT FROM 'leader' OR required_role <> 'leader' THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';
  END IF;
END $$;
CREATE TABLE app_private.maps(map_id text PRIMARY KEY, image_path text NOT NULL);
CREATE TABLE public.game_state(id integer PRIMARY KEY, active_map_id text);
CREATE TABLE public.map_config(map_id text PRIMARY KEY, cell_size numeric);
CREATE TABLE public.characters(id integer PRIMARY KEY);
CREATE TABLE public.token_positions(character_id integer REFERENCES public.characters, map_id text REFERENCES public.map_config ON DELETE CASCADE);
CREATE TABLE app_private.npcs(id integer PRIMARY KEY);
CREATE TABLE app_private.npc_placements(npc_id integer REFERENCES app_private.npcs ON DELETE CASCADE, map_id text REFERENCES app_private.maps);
CREATE TABLE app_private.npc_tokens_5a_backup(map_id text REFERENCES app_private.maps);
INSERT INTO app_private.maps VALUES ('active','./assets/maps/test.png'), ('target','maps/12345678-1234-1234-1234-123456789abc.png'), ('other','other');
INSERT INTO public.game_state VALUES(1,'active');
INSERT INTO public.map_config SELECT map_id,100 FROM app_private.maps;
INSERT INTO public.characters VALUES(1);
INSERT INTO app_private.npcs VALUES(1);
INSERT INTO public.token_positions SELECT 1,map_id FROM app_private.maps;
INSERT INTO app_private.npc_placements SELECT 1,map_id FROM app_private.maps;
INSERT INTO app_private.npc_tokens_5a_backup SELECT map_id FROM app_private.maps;
\ir ../supabase/migrations/20261001160000_leader_map_delete.sql
-- A late DB failure must roll back the already deleted children as well.
CREATE FUNCTION app_private.reject_fixture_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'fixture failure' USING ERRCODE='ZX001'; END $$;
CREATE TRIGGER reject_fixture_delete BEFORE DELETE ON app_private.maps
FOR EACH ROW EXECUTE FUNCTION app_private.reject_fixture_delete();
DO $$ BEGIN
  BEGIN
    PERFORM public.leader_delete_map('leader','target');
    RAISE EXCEPTION 'Expected fixture failure';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
  IF NOT EXISTS(SELECT FROM app_private.maps WHERE map_id='target')
    OR NOT EXISTS(SELECT FROM public.map_config WHERE map_id='target')
    OR NOT EXISTS(SELECT FROM public.token_positions WHERE map_id='target')
    OR NOT EXISTS(SELECT FROM app_private.npc_placements WHERE map_id='target')
    OR NOT EXISTS(SELECT FROM app_private.npc_tokens_5a_backup WHERE map_id='target') THEN
    RAISE EXCEPTION 'Delete failure did not roll back children';
  END IF;
END $$;
DROP TRIGGER reject_fixture_delete ON app_private.maps;
DROP FUNCTION app_private.reject_fixture_delete();
SET ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.leader_delete_map('leader','target');
    RAISE EXCEPTION 'Direct client RPC accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ DECLARE bad text; path text; BEGIN
  IF has_function_privilege('anon','public.leader_delete_map(text,text)','EXECUTE')
    OR has_function_privilege('authenticated','public.leader_delete_map(text,text)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.leader_delete_map(text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Incorrect delete privileges';
  END IF;
  FOREACH bad IN ARRAY ARRAY['player','invalid','expired',NULL] LOOP
    BEGIN
      PERFORM public.leader_delete_map(bad,'target');
      RAISE EXCEPTION 'Unauthorized delete accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  BEGIN
    PERFORM public.leader_delete_map('leader','active');
    RAISE EXCEPTION 'Active delete accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  SELECT image_path INTO path FROM public.leader_delete_map('leader','target');
  IF path <> 'maps/12345678-1234-1234-1234-123456789abc.png'
    OR EXISTS(SELECT FROM app_private.maps WHERE map_id='target')
    OR EXISTS(SELECT FROM public.map_config WHERE map_id='target')
    OR EXISTS(SELECT FROM public.token_positions WHERE map_id='target')
    OR EXISTS(SELECT FROM app_private.npc_placements WHERE map_id='target')
    OR EXISTS(SELECT FROM app_private.npc_tokens_5a_backup WHERE map_id='target') THEN
    RAISE EXCEPTION 'Incomplete delete';
  END IF;
  IF (SELECT count(*) FROM app_private.maps) <> 2
    OR (SELECT count(*) FROM public.map_config) <> 2
    OR (SELECT count(*) FROM public.token_positions) <> 2
    OR (SELECT count(*) FROM app_private.npc_placements) <> 2
    OR (SELECT count(*) FROM app_private.npc_tokens_5a_backup) <> 2
    OR (SELECT count(*) FROM public.characters) <> 1
    OR (SELECT count(*) FROM app_private.npcs) <> 1
    OR (SELECT active_map_id FROM public.game_state WHERE id=1) <> 'active' THEN
    RAISE EXCEPTION 'Unrelated data changed';
  END IF;
  BEGIN
    PERFORM public.leader_set_active_map('leader','target');
    RAISE EXCEPTION 'Deleted map activated';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
-- Fixtures remain in this disposable database for the two-connection race test.
