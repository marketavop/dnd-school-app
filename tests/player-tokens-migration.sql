-- EMPTY disposable PostgreSQL database only. These migrations commit DDL.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.characters (id uuid PRIMARY KEY, name text NOT NULL, portrait_path text);
CREATE TABLE public.map_config (map_id text PRIMARY KEY, cell_size numeric);
CREATE TABLE public.game_state (id integer PRIMARY KEY, active_map_id text);
CREATE TABLE public.token_positions (
  character_id uuid REFERENCES public.characters(id), map_id text,
  x numeric NOT NULL, y numeric NOT NULL, PRIMARY KEY (character_id, map_id)
);
GRANT ALL ON public.token_positions TO anon, authenticated;
GRANT UPDATE (character_id, map_id, x, y), INSERT (character_id, map_id, x, y) ON public.token_positions TO anon, authenticated;
INSERT INTO public.map_config VALUES ('test-map', 100), ('mapa-akademie', 150);
INSERT INTO public.game_state VALUES (1, 'test-map');
\ir ../supabase/migrations/20260922120000_simple_login.sql
\ir ../supabase/migrations/20260923120000_session_tokens.sql
\ir ../supabase/migrations/20260924120000_leader_maps.sql
\ir ../supabase/migrations/20260924140000_player_tokens.sql
BEGIN;
INSERT INTO public.characters VALUES
  ('10000000-0000-0000-0000-000000000001', 'Hráč A', './portraits/a.png'),
  ('10000000-0000-0000-0000-000000000002', 'Hráč B', NULL),
  ('10000000-0000-0000-0000-000000000003', 'Nepřiřazená postava', NULL);
INSERT INTO app_private.users(username, password_hash, role, character_id) VALUES
  ('fixture-player', extensions.crypt('test-password', extensions.gen_salt('bf', 12)), 'player', '10000000-0000-0000-0000-000000000001'),
  ('fixture-player-b', extensions.crypt('test-password', extensions.gen_salt('bf', 12)), 'player', '10000000-0000-0000-0000-000000000002'),
  ('fixture-leader', extensions.crypt('test-password', extensions.gen_salt('bf', 12)), 'leader', NULL);
INSERT INTO public.token_positions VALUES
  ('10000000-0000-0000-0000-000000000001', 'test-map', 375, 375),
  ('10000000-0000-0000-0000-000000000001', 'mapa-akademie', 225, 225);
CREATE TEMP TABLE before_characters AS SELECT * FROM public.characters;
CREATE TEMP TABLE before_users AS SELECT * FROM app_private.users;
CREATE TEMP TABLE tokens AS
  SELECT role, session_token FROM public.login('fixture-player', 'test-password')
  UNION ALL SELECT role, session_token FROM public.login('fixture-leader', 'test-password');
GRANT SELECT ON tokens TO anon;
SET LOCAL ROLE anon;
DO $$
DECLARE leader_token text; player_session text; bad text; result jsonb;
  a uuid := '10000000-0000-0000-0000-000000000001';
  b uuid := '10000000-0000-0000-0000-000000000002';
BEGIN
  SELECT session_token INTO STRICT leader_token FROM tokens WHERE role = 'leader';
  SELECT session_token INTO STRICT player_session FROM tokens WHERE role = 'player';
  IF (SELECT count(*) FROM public.leader_player_tokens(leader_token, 'test-map')) <> 2 THEN
    RAISE EXCEPTION 'Leader roster must contain only assigned player characters';
  END IF;
  SELECT to_jsonb(t) INTO STRICT result FROM public.leader_player_tokens(leader_token, 'test-map') t WHERE character_id = a;
  IF result <> jsonb_build_object('character_id', a, 'name', 'Hráč A', 'portrait_path', './portraits/a.png', 'x', 375, 'y', 375) THEN
    RAISE EXCEPTION 'Unexpected fields or position';
  END IF;
  IF NOT EXISTS (SELECT FROM public.leader_player_tokens(leader_token, 'test-map') WHERE character_id = b AND x IS NULL AND y IS NULL) THEN
    RAISE EXCEPTION 'Absent token must still appear in roster';
  END IF;
  SELECT to_jsonb(t) INTO STRICT result FROM public.player_token(player_session, 'test-map') t;
  IF result->>'character_id' <> a::text THEN RAISE EXCEPTION 'Player roster is not scoped'; END IF;
  BEGIN
    PERFORM * FROM public.leader_player_tokens(player_session, 'test-map');
    RAISE EXCEPTION 'Player used leader RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- All player mutation routes reject a forged character_id, including a missing row.
  BEGIN
    PERFORM * FROM public.add_token(player_session, b, 'test-map', 50, 50);
    RAISE EXCEPTION 'Player added foreign token';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM * FROM public.set_token_position(player_session, b, 'test-map', 50, 50);
    RAISE EXCEPTION 'Player moved foreign token';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.remove_token(player_session, b, 'test-map');
    RAISE EXCEPTION 'Player deleted foreign token';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS (SELECT FROM public.token_positions WHERE character_id = b) THEN RAISE EXCEPTION 'Unauthorized writes changed data'; END IF;
  BEGIN
    PERFORM * FROM public.add_token(leader_token, '10000000-0000-0000-0000-000000000003', 'test-map', 50, 50);
    RAISE EXCEPTION 'Unassigned character accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- Direct writes remain denied even with RLS disabled and old column grants.
  BEGIN
    UPDATE public.token_positions SET x = 999 WHERE character_id = a;
    RAISE EXCEPTION 'Direct UPDATE accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.token_positions VALUES (b, 'test-map', 50, 50);
    RAISE EXCEPTION 'Direct INSERT accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.token_positions WHERE character_id = a;
    RAISE EXCEPTION 'Direct DELETE accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF has_table_privilege('anon', 'public.token_positions', 'TRUNCATE')
    OR has_column_privilege('authenticated', 'public.token_positions', 'x', 'UPDATE') THEN
    RAISE EXCEPTION 'Direct privilege bypass remains';
  END IF;

  PERFORM * FROM public.add_token(leader_token, b, 'test-map', 750, 550);
  PERFORM * FROM public.add_token(leader_token, b, 'test-map', 50, 50);
  IF (SELECT count(*) FROM public.token_positions WHERE character_id = b) <> 1
    OR NOT EXISTS (SELECT FROM public.token_positions WHERE character_id = b AND x = 750 AND y = 550) THEN
    RAISE EXCEPTION 'Repeated add moved or duplicated token';
  END IF;
  PERFORM * FROM public.set_token_position(leader_token, a, 'test-map', 150, 250);
  PERFORM * FROM public.set_token_position(leader_token, b, 'test-map', 250, 350);
  PERFORM * FROM public.set_token_position(player_session, a, 'test-map', 450, 550);
  IF NOT EXISTS (SELECT FROM public.token_positions WHERE character_id = a AND map_id = 'test-map' AND x = 450 AND y = 550) THEN
    RAISE EXCEPTION 'Own player move failed';
  END IF;
  PERFORM public.remove_token(leader_token, a, 'test-map');
  IF EXISTS (SELECT FROM public.token_positions WHERE character_id = a AND map_id = 'test-map')
    OR NOT EXISTS (SELECT FROM public.token_positions WHERE character_id = a AND map_id = 'mapa-akademie' AND x = 225 AND y = 225) THEN
    RAISE EXCEPTION 'Removal affected wrong map';
  END IF;
  BEGIN
    PERFORM * FROM public.set_token_position(player_session, a, 'test-map', 50, 50);
    RAISE EXCEPTION 'Late drag resurrected removed token';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM * FROM public.add_token(player_session, a, 'test-map', 50, 50);
  PERFORM public.remove_token(player_session, a, 'test-map');
  FOR bad IN SELECT repeat('0',64) UNION ALL SELECT NULL UNION ALL SELECT 'bad' LOOP
    BEGIN
      PERFORM * FROM public.leader_player_tokens(bad, 'test-map');
      RAISE EXCEPTION 'Invalid session read accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      PERFORM * FROM public.add_token(bad, b, 'test-map', 50, 50);
      RAISE EXCEPTION 'Invalid session add accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      PERFORM * FROM public.set_token_position(bad, b, 'test-map', 50, 50);
      RAISE EXCEPTION 'Invalid session move accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      PERFORM public.remove_token(bad, b, 'test-map');
      RAISE EXCEPTION 'Invalid session remove accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
END $$;
RESET ROLE;
UPDATE app_private.sessions SET created_at = clock_timestamp() - interval '31 minutes', expires_at = clock_timestamp() - interval '1 minute';
SET LOCAL ROLE anon;
DO $$ DECLARE expired text; BEGIN
  FOR expired IN SELECT session_token FROM tokens LOOP
    BEGIN
      PERFORM * FROM public.add_token(expired, '10000000-0000-0000-0000-000000000001', 'test-map', 50, 50);
      RAISE EXCEPTION 'Expired session add accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      PERFORM * FROM public.set_token_position(expired, '10000000-0000-0000-0000-000000000001', 'test-map', 50, 50);
      RAISE EXCEPTION 'Expired session move accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      PERFORM public.remove_token(expired, '10000000-0000-0000-0000-000000000001', 'test-map');
      RAISE EXCEPTION 'Expired session delete accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS ((SELECT * FROM public.characters EXCEPT SELECT * FROM before_characters)
    UNION ALL (SELECT * FROM before_characters EXCEPT SELECT * FROM public.characters))
    OR EXISTS ((SELECT * FROM app_private.users EXCEPT SELECT * FROM before_users)
    UNION ALL (SELECT * FROM before_users EXCEPT SELECT * FROM app_private.users)) THEN
    RAISE EXCEPTION 'Account or character data changed';
  END IF;
  IF (SELECT active_map_id FROM public.game_state WHERE id = 1) <> 'test-map'
    OR (SELECT cell_size FROM public.map_config WHERE map_id = 'test-map') <> 100 THEN
    RAISE EXCEPTION 'Map state/config changed';
  END IF;
END $$;
ROLLBACK;
