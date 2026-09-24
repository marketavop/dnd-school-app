-- Run only in an empty disposable PostgreSQL database as an administrator.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.characters (id uuid PRIMARY KEY);
\ir ../supabase/migrations/20260922120000_simple_login.sql
BEGIN;
INSERT INTO app_private.users (username, password_hash, role) VALUES
  ('test-player', extensions.crypt('test-password', extensions.gen_salt('bf', 12)), 'player'),
  ('test-leader', extensions.crypt('other-password', extensions.gen_salt('bf', 12)), 'leader');
DO $$
BEGIN
  BEGIN
    INSERT INTO app_private.users (username, password_hash, role)
      VALUES ('invalid-role', extensions.crypt('x', extensions.gen_salt('bf', 12)), 'admin');
    RAISE EXCEPTION 'Invalid role accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO app_private.users (username, password_hash, role) VALUES ('plaintext', 'password', 'player');
    RAISE EXCEPTION 'Plaintext accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SET LOCAL ROLE anon;
DO $$
DECLARE result jsonb;
BEGIN
  SELECT to_jsonb(u) INTO result FROM public.login('test-player', 'test-password') u;
  IF result->>'role' IS DISTINCT FROM 'player' OR result->>'user_id' IS NULL
    OR result ? 'password_hash' OR result ? 'password' THEN
    RAISE EXCEPTION 'Invalid player response: %', result;
  END IF;
  IF (SELECT role FROM public.login('test-leader', 'other-password')) IS DISTINCT FROM 'leader' THEN
    RAISE EXCEPTION 'Leader login failed';
  END IF;
  IF EXISTS (SELECT FROM public.login('test-player', 'wrong'))
     OR EXISTS (SELECT FROM public.login('missing', 'wrong'))
     OR EXISTS (SELECT FROM public.login(NULL, NULL))
     OR EXISTS (SELECT FROM public.login('test-player', repeat('x', 73))) THEN
    RAISE EXCEPTION 'Invalid credentials accepted';
  END IF;
  BEGIN
    PERFORM * FROM app_private.users;
    RAISE EXCEPTION 'Anonymous user can read accounts';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;
