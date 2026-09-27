-- Run only in an EMPTY disposable database. Migration files commit their DDL.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.characters (id uuid PRIMARY KEY, user_id uuid, name text NOT NULL);
\ir ../supabase/migrations/20260921120000_extend_characters_sheet.sql
\ir ../supabase/migrations/20260921130000_extend_characters_xp_hp.sql
\ir ../supabase/migrations/20260922120000_simple_login.sql
\ir ../supabase/migrations/20260923120000_session_tokens.sql
\ir ../supabase/migrations/20260923130000_leader_players.sql
BEGIN;
INSERT INTO public.characters(id, name, str, current_hp, max_hp) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Test Postava', 16, 8, 12),
  ('10000000-0000-0000-0000-000000000002', 'Unassigned', NULL, NULL, NULL),
  ('10000000-0000-0000-0000-000000000003', 'Leader only', NULL, NULL, NULL);
INSERT INTO app_private.users(username, password_hash, role, character_id) VALUES
  ('fixture-player', extensions.crypt('test-password', extensions.gen_salt('bf', 12)), 'player', '10000000-0000-0000-0000-000000000001'),
  ('fixture-leader', extensions.crypt('test-password', extensions.gen_salt('bf', 12)), 'leader', '10000000-0000-0000-0000-000000000003');
CREATE TEMP TABLE tokens AS
  SELECT role, session_token FROM public.login('fixture-player', 'test-password')
  UNION ALL SELECT role, session_token FROM public.login('fixture-leader', 'test-password');
CREATE TEMP TABLE before_characters AS SELECT * FROM public.characters;
GRANT SELECT ON tokens TO anon;
SET LOCAL ROLE anon;
DO $$
DECLARE token text; result jsonb; bad text;
BEGIN
  SELECT session_token INTO STRICT token FROM tokens WHERE role = 'leader';
  SELECT to_jsonb(p) INTO STRICT result FROM public.leader_players(token) p;
  IF result <> '{"character_id":"10000000-0000-0000-0000-000000000001","name":"Test Postava"}'::jsonb THEN
    RAISE EXCEPTION 'Incorrect list or leaked fields';
  END IF;
  SELECT to_jsonb(c) INTO STRICT result FROM public.leader_character(token, '10000000-0000-0000-0000-000000000001') c;
  IF result->>'name' <> 'Test Postava' OR result->>'str' <> '16' OR result->>'current_hp' <> '8'
    OR result ? 'password_hash' OR result ? 'user_id' THEN
    RAISE EXCEPTION 'Incorrect sheet response';
  END IF;
  IF EXISTS (SELECT FROM public.leader_character(token, '10000000-0000-0000-0000-000000000002'))
    OR EXISTS (SELECT FROM public.leader_character(token, '10000000-0000-0000-0000-000000000003')) THEN
    RAISE EXCEPTION 'Unassigned or leader-only character exposed';
  END IF;
  FOR bad IN SELECT session_token FROM tokens WHERE role = 'player'
      UNION ALL SELECT repeat('0',64) UNION ALL SELECT NULL UNION ALL SELECT 'bad' LOOP
    BEGIN
      PERFORM * FROM public.leader_players(bad);
      RAISE EXCEPTION 'Unauthorized list accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM * FROM public.leader_character(bad, '10000000-0000-0000-0000-000000000001');
      RAISE EXCEPTION 'Unauthorized sheet accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $$;
RESET ROLE;
UPDATE app_private.sessions SET created_at = clock_timestamp() - interval '31 minutes',
  expires_at = clock_timestamp() - interval '1 minute';
SET LOCAL ROLE anon;
DO $$
DECLARE token text;
BEGIN
  SELECT session_token INTO STRICT token FROM tokens WHERE role = 'leader';
  BEGIN
    PERFORM * FROM public.leader_players(token);
    RAISE EXCEPTION 'Expired list accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.leader_character(token, '10000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'Expired sheet accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS ((SELECT * FROM public.characters EXCEPT SELECT * FROM before_characters)
    UNION ALL (SELECT * FROM before_characters EXCEPT SELECT * FROM public.characters)) THEN
    RAISE EXCEPTION 'Character data changed';
  END IF;
END $$;
ROLLBACK;
