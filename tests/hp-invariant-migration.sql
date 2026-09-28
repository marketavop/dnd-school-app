-- psql -X -v ON_ERROR_STOP=1 -d <EMPTY disposable database> -f tests/hp-invariant-migration.sql
-- This script commits fixtures to test persistence across transactions.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.characters (id uuid PRIMARY KEY, user_id uuid, name text NOT NULL);
\ir ../supabase/migrations/20260921120000_extend_characters_sheet.sql
\ir ../supabase/migrations/20260921130000_extend_characters_xp_hp.sql
\ir ../supabase/migrations/20260922120000_simple_login.sql
\ir ../supabase/migrations/20260923120000_session_tokens.sql
\ir ../supabase/migrations/20260925160000_player_character_ownership.sql
\ir ../supabase/migrations/20260925170000_user_characters_ownership.sql
INSERT INTO public.characters(id,name,current_hp,max_hp) VALUES
  ('10000000-0000-0000-0000-000000000001','HP fixture',10,20);
\ir ../supabase/migrations/20260928120000_character_hp_invariant.sql
INSERT INTO app_private.users(username,password_hash,role) VALUES
  ('hp-player',extensions.crypt('fixture-password',extensions.gen_salt('bf',12)),'player'),
  ('hp-leader',extensions.crypt('fixture-password',extensions.gen_salt('bf',12)),'leader');
INSERT INTO app_private.user_characters SELECT id,'10000000-0000-0000-0000-000000000001'::uuid
  FROM app_private.users WHERE username='hp-player';
CREATE TEMP TABLE hp_tokens AS SELECT role,session_token FROM public.login('hp-player','fixture-password')
  UNION ALL SELECT role,session_token FROM public.login('hp-leader','fixture-password');
GRANT SELECT ON hp_tokens TO anon;

BEGIN;
SET LOCAL ROLE anon;
DO $$ DECLARE t text; r record; BEGIN
  SELECT session_token INTO STRICT t FROM hp_tokens WHERE role='player';
  SELECT * INTO STRICT r FROM public.player_update_character(t,'10000000-0000-0000-0000-000000000001','{"current_hp":15}');
  IF r.current_hp IS DISTINCT FROM 15 OR r.max_hp IS DISTINCT FROM 20 THEN RAISE EXCEPTION 'A failed'; END IF;
END $$;
COMMIT;
BEGIN;
SET LOCAL ROLE anon;
DO $$ DECLARE t text; r record; patch jsonb; BEGIN
  SELECT session_token INTO STRICT t FROM hp_tokens WHERE role='player';
  SELECT * INTO STRICT r FROM public.player_character(t,'10000000-0000-0000-0000-000000000001');
  IF r.current_hp IS DISTINCT FROM 15 OR r.max_hp IS DISTINCT FROM 20 THEN RAISE EXCEPTION 'Persistence A failed'; END IF;
  FOREACH patch IN ARRAY ARRAY['{"current_hp":-1}'::jsonb,'{"max_hp":-1}'::jsonb,'{"current_hp":25}'::jsonb] LOOP
    BEGIN
      PERFORM * FROM public.player_update_character(t,'10000000-0000-0000-0000-000000000001',patch);
      RAISE EXCEPTION 'Invalid HP accepted: %',patch;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    SELECT * INTO STRICT r FROM public.player_character(t,'10000000-0000-0000-0000-000000000001');
    IF r.current_hp IS DISTINCT FROM 15 OR r.max_hp IS DISTINCT FROM 20 THEN RAISE EXCEPTION 'Rejected write changed state'; END IF;
  END LOOP;
  SELECT * INTO STRICT r FROM public.player_update_character(t,'10000000-0000-0000-0000-000000000001','{"max_hp":10}');
  IF r.current_hp IS DISTINCT FROM 10 OR r.max_hp IS DISTINCT FROM 10 THEN RAISE EXCEPTION 'B failed'; END IF;
END $$;
COMMIT;
BEGIN;
SET LOCAL ROLE anon;
DO $$ DECLARE t text; r record; BEGIN
  SELECT session_token INTO STRICT t FROM hp_tokens WHERE role='player';
  SELECT * INTO STRICT r FROM public.player_character(t,'10000000-0000-0000-0000-000000000001');
  IF r.current_hp IS DISTINCT FROM 10 OR r.max_hp IS DISTINCT FROM 10 THEN RAISE EXCEPTION 'Persistence B failed'; END IF;
  SELECT * INTO STRICT r FROM public.leader_character((SELECT session_token FROM hp_tokens WHERE role='leader'),'10000000-0000-0000-0000-000000000001');
  IF r.current_hp IS DISTINCT FROM 10 OR r.max_hp IS DISTINCT FROM 10 THEN RAISE EXCEPTION 'Leader HP failed'; END IF;
  SELECT * INTO STRICT r FROM public.player_update_character(t,'10000000-0000-0000-0000-000000000001','{"max_hp":0}');
  IF r.current_hp IS DISTINCT FROM 0 OR r.max_hp IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Zero HP failed'; END IF;
  PERFORM * FROM public.player_update_character(t,'10000000-0000-0000-0000-000000000001','{"current_hp":null}');
  PERFORM * FROM public.player_update_character(t,'10000000-0000-0000-0000-000000000001','{"max_hp":null}');
  SELECT * INTO STRICT r FROM public.player_update_character(t,'10000000-0000-0000-0000-000000000001','{"current_hp":25}');
  IF r.current_hp IS DISTINCT FROM 25 OR r.max_hp IS NOT NULL THEN RAISE EXCEPTION 'Nullable HP changed'; END IF;
  SELECT * INTO STRICT r FROM public.player_update_character(t,'10000000-0000-0000-0000-000000000001','{"max_hp":12}');
  IF r.current_hp IS DISTINCT FROM 12 OR r.max_hp IS DISTINCT FROM 12 THEN RAISE EXCEPTION 'Setting maximum failed'; END IF;
END $$;
RESET ROLE;
-- Constraint also protects writes that do not use the RPC (e.g. an admin tool).
DO $$ BEGIN
  BEGIN
    UPDATE public.characters SET current_hp=25,max_hp=20;
    RAISE EXCEPTION 'Direct invalid write accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
