-- Run only in an EMPTY disposable PostgreSQL database; migrations commit DDL.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.characters (id uuid PRIMARY KEY, name text);
CREATE TABLE public.map_config (map_id text PRIMARY KEY, cell_size numeric);
CREATE TABLE public.game_state (id integer PRIMARY KEY, active_map_id text);
INSERT INTO public.map_config VALUES ('test-map', 80), ('mapa-akademie', 150);
INSERT INTO public.game_state VALUES (1, 'mapa-akademie');
\ir ../supabase/migrations/20260922120000_simple_login.sql
\ir ../supabase/migrations/20260923120000_session_tokens.sql
\ir ../supabase/migrations/20260924120000_leader_maps.sql
\ir ../supabase/migrations/20260924130000_leader_set_active_map.sql
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
DECLARE token text; bad text;
BEGIN
  SELECT session_token INTO STRICT token FROM tokens WHERE role = 'leader';
  IF (SELECT count(*) FROM public.leader_maps(token)) <> 2
    OR NOT EXISTS (SELECT FROM public.leader_maps(token) WHERE map_id = 'mapa-akademie' AND is_active AND cell_size = 150)
    OR NOT EXISTS (SELECT FROM public.leader_maps(token) WHERE map_id = 'test-map' AND NOT is_active AND cell_size = 80
      AND name = 'Test map' AND image_path = './assets/maps/test-map.png') THEN
    RAISE EXCEPTION 'Incorrect map list';
  END IF;
  BEGIN
    PERFORM * FROM app_private.maps;
    RAISE EXCEPTION 'Direct access allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  FOR bad IN SELECT session_token FROM tokens WHERE role = 'player'
    UNION ALL SELECT repeat('0', 64) UNION ALL SELECT NULL UNION ALL SELECT 'bad' LOOP
    BEGIN
      PERFORM * FROM public.leader_set_active_map(bad, 'test-map');
      RAISE EXCEPTION 'Unauthorized session accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM * FROM public.leader_set_active_map(token, 'missing-map');
    RAISE EXCEPTION 'Unknown map accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF NOT EXISTS (SELECT FROM public.leader_maps(token) WHERE map_id = 'mapa-akademie' AND is_active) THEN
    RAISE EXCEPTION 'Rejected request changed active state';
  END IF;
  PERFORM * FROM public.leader_set_active_map(token, 'test-map');
  IF NOT EXISTS (SELECT FROM public.leader_maps(token) WHERE map_id = 'test-map' AND is_active AND cell_size = 80) THEN
    RAISE EXCEPTION 'Activation failed or changed grid';
  END IF;
  IF has_table_privilege('anon', 'public.game_state', 'UPDATE')
    OR has_column_privilege('anon', 'public.game_state', 'active_map_id', 'UPDATE') THEN
    RAISE EXCEPTION 'Direct update bypass remains';
  END IF;
END $$;
RESET ROLE;
UPDATE public.game_state SET active_map_id = 'test-map' WHERE id = 1;
UPDATE public.map_config SET cell_size = 90 WHERE map_id = 'test-map';
SET LOCAL ROLE anon;
DO $$ DECLARE token text; BEGIN
  SELECT session_token INTO STRICT token FROM tokens WHERE role = 'leader';
  IF NOT EXISTS (SELECT FROM public.leader_maps(token) WHERE map_id = 'test-map' AND is_active AND cell_size = 90)
    OR EXISTS (SELECT FROM public.leader_maps(token) WHERE map_id = 'mapa-akademie' AND is_active) THEN
    RAISE EXCEPTION 'Existing sources of truth not used';
  END IF;
END $$;
RESET ROLE;
UPDATE app_private.sessions SET created_at = clock_timestamp() - interval '31 minutes',
  expires_at = clock_timestamp() - interval '1 minute';
SET LOCAL ROLE anon;
DO $$ DECLARE token text; BEGIN
  SELECT session_token INTO STRICT token FROM tokens WHERE role = 'leader';
  BEGIN
    PERFORM * FROM public.leader_set_active_map(token, 'test-map');
    RAISE EXCEPTION 'Expired session accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;

