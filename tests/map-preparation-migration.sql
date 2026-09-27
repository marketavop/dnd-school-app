-- Run only in an EMPTY disposable database. Migrations commit DDL.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.characters (id uuid PRIMARY KEY);
CREATE TABLE public.game_state (id integer PRIMARY KEY, active_map_id text);
CREATE TABLE public.map_config (map_id text PRIMARY KEY, cell_size numeric);
CREATE TABLE public.token_positions (character_id uuid, map_id text, x numeric, y numeric);
INSERT INTO public.game_state VALUES (1, 'test-map');
INSERT INTO public.map_config VALUES ('test-map', 100), ('mapa-akademie', 90);
INSERT INTO public.token_positions VALUES ('10000000-0000-0000-0000-000000000001', 'test-map', 375, 375);
GRANT ALL ON public.map_config TO anon, authenticated;
GRANT UPDATE (cell_size) ON public.map_config TO anon, authenticated;
\ir ../supabase/migrations/20260922120000_simple_login.sql
\ir ../supabase/migrations/20260923120000_session_tokens.sql
\ir ../supabase/migrations/20260924120000_leader_maps.sql
\ir ../supabase/migrations/20260924150000_map_preparation.sql
BEGIN;
INSERT INTO app_private.users(username, password_hash, role) VALUES
  ('fixture-player', extensions.crypt('test-password', extensions.gen_salt('bf', 12)), 'player'),
  ('fixture-leader', extensions.crypt('test-password', extensions.gen_salt('bf', 12)), 'leader');
CREATE TEMP TABLE tokens AS
  SELECT role, session_token FROM public.login('fixture-player', 'test-password')
  UNION ALL SELECT role, session_token FROM public.login('fixture-leader', 'test-password');
GRANT SELECT ON tokens TO anon;
SET LOCAL ROLE anon;
DO $$
DECLARE token text; bad text; value numeric;
BEGIN
  SELECT session_token INTO STRICT token FROM tokens WHERE role = 'leader';
  FOREACH value IN ARRAY ARRAY[20,300,80.5,120]::numeric[] LOOP
    IF (SELECT cell_size FROM public.leader_set_map_cell_size(token, 'mapa-akademie', value)) <> value THEN
      RAISE EXCEPTION 'Valid value not saved exactly';
    END IF;
  END LOOP;
  FOREACH value IN ARRAY ARRAY[NULL::numeric,10,500,'NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric] LOOP
    BEGIN
      PERFORM * FROM public.leader_set_map_cell_size(token, 'mapa-akademie', value);
      RAISE EXCEPTION 'Invalid size accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  END LOOP;
  BEGIN
    PERFORM * FROM public.leader_set_map_cell_size(token, 'unknown', 100);
    RAISE EXCEPTION 'Unknown map accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  FOR bad IN SELECT session_token FROM tokens WHERE role = 'player'
    UNION ALL SELECT repeat('0',64) UNION ALL SELECT NULL UNION ALL SELECT 'bad' LOOP
    BEGIN
      PERFORM * FROM public.leader_set_map_cell_size(bad, 'mapa-akademie', 200);
      RAISE EXCEPTION 'Unauthorized session accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  BEGIN
    UPDATE public.map_config SET cell_size = 200 WHERE map_id = 'mapa-akademie';
    RAISE EXCEPTION 'Direct write bypass';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT cell_size FROM public.map_config WHERE map_id = 'mapa-akademie') <> 120
    OR (SELECT cell_size FROM public.map_config WHERE map_id = 'test-map') <> 100 THEN
    RAISE EXCEPTION 'Wrong config changed';
  END IF;
  IF has_column_privilege('authenticated','public.map_config','cell_size','UPDATE') THEN
    RAISE EXCEPTION 'Column update bypass';
  END IF;
END $$;
RESET ROLE;
UPDATE app_private.sessions SET created_at = clock_timestamp() - interval '31 minutes', expires_at = clock_timestamp() - interval '1 minute';
SET LOCAL ROLE anon;
DO $$ DECLARE token text; BEGIN
  SELECT session_token INTO STRICT token FROM tokens WHERE role = 'leader';
  BEGIN
    PERFORM * FROM public.leader_set_map_cell_size(token, 'mapa-akademie', 200);
    RAISE EXCEPTION 'Expired session accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT active_map_id FROM public.game_state WHERE id = 1) <> 'test-map'
    OR (SELECT count(*) FROM public.token_positions) <> 1
    OR NOT EXISTS (SELECT FROM public.token_positions WHERE map_id = 'test-map' AND x = 375 AND y = 375)
    OR (SELECT cell_size FROM public.map_config WHERE map_id = 'mapa-akademie') <> 120 THEN
    RAISE EXCEPTION 'Token/active state or saved config changed unexpectedly';
  END IF;
END $$;
ROLLBACK;
