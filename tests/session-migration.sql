-- Empty disposable PostgreSQL database only; migrations commit their DDL.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.characters (id uuid PRIMARY KEY);
\ir ../supabase/migrations/20260922120000_simple_login.sql
\ir ../supabase/migrations/20260923120000_session_tokens.sql
\ir ../supabase/migrations/20260924160000_session_ttl_8_hours.sql
BEGIN;
INSERT INTO app_private.users (username, password_hash, role) VALUES
  ('session-player', extensions.crypt('test-password', extensions.gen_salt('bf', 12)), 'player'),
  ('session-leader', extensions.crypt('test-password', extensions.gen_salt('bf', 12)), 'leader');
CREATE TEMP TABLE issued (response jsonb);
GRANT SELECT, INSERT ON issued TO anon;
SET LOCAL ROLE anon;
INSERT INTO issued SELECT to_jsonb(r) FROM public.login('session-player', 'test-password') r;
INSERT INTO issued SELECT to_jsonb(r) FROM public.login('session-leader', 'test-password') r;
INSERT INTO issued SELECT to_jsonb(r) FROM public.login('session-player', 'test-password') r;
DO $$
DECLARE item jsonb; identity record; bad text;
BEGIN
  IF (SELECT count(*) FROM issued) <> 3
     OR (SELECT count(DISTINCT response->>'session_token') FROM issued) <> 3 THEN
    RAISE EXCEPTION 'Login did not issue distinct tokens';
  END IF;
  FOR item IN SELECT response FROM issued LOOP
    IF item->>'session_token' !~ '^[0-9a-f]{64}$'
       OR (SELECT count(*) FROM jsonb_object_keys(item)) <> 4
       OR item ? 'password' OR item ? 'password_hash' THEN
      RAISE EXCEPTION 'Invalid login response';
    END IF;
    SELECT * INTO STRICT identity FROM public.validate_session(item->>'session_token');
    IF identity.user_id::text IS DISTINCT FROM item->>'user_id'
       OR identity.role IS DISTINCT FROM item->>'role' THEN
      RAISE EXCEPTION 'Wrong token identity';
    END IF;
  END LOOP;
  FOREACH bad IN ARRAY ARRAY[NULL, '', 'bad', repeat('0',64), repeat('g',64)] LOOP
    BEGIN
      PERFORM * FROM public.validate_session(bad);
      RAISE EXCEPTION 'Invalid token accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM * FROM app_private.sessions;
    RAISE EXCEPTION 'Anonymous session read allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM app_private.sessions;
    RAISE EXCEPTION 'Anonymous session write allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM app_private.require_session((SELECT response->>'session_token' FROM issued LIMIT 1));
    RAISE EXCEPTION 'Private helper exposed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS (SELECT FROM public.login('session-player', 'wrong')) THEN
    RAISE EXCEPTION 'Wrong password accepted';
  END IF;
END $$;
RESET ROLE;
DO $$
DECLARE item jsonb;
BEGIN
  IF (SELECT count(*) FROM app_private.sessions) <> 3 THEN
    RAISE EXCEPTION 'Failed login created session';
  END IF;
  IF EXISTS (SELECT FROM app_private.sessions s
    WHERE s.expires_at - s.created_at <> interval '8 hours') THEN
    RAISE EXCEPTION 'Wrong TTL';
  END IF;
  FOR item IN SELECT response FROM issued LOOP
    IF NOT EXISTS (SELECT FROM app_private.sessions s
      WHERE s.token_hash = extensions.digest(item->>'session_token', 'sha256')
        AND s.user_id::text = item->>'user_id' AND s.role = item->>'role') THEN
      RAISE EXCEPTION 'Hash/identity storage mismatch';
    END IF;
    IF item->>'role' = 'leader' THEN
      PERFORM * FROM app_private.require_session(item->>'session_token', 'leader');
    ELSE
      BEGIN
        PERFORM * FROM app_private.require_session(item->>'session_token', 'leader');
        RAISE EXCEPTION 'Player authorized as leader';
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;
-- A role change invalidates the prior leader token; player tokens expire.
UPDATE app_private.users SET role = 'player' WHERE username = 'session-leader';
UPDATE app_private.sessions SET created_at = clock_timestamp() - interval '31 minutes',
  expires_at = clock_timestamp() - interval '1 minute' WHERE role = 'player';
SET LOCAL ROLE anon;
DO $$
DECLARE item jsonb;
BEGIN
  FOR item IN SELECT response FROM issued LOOP
    BEGIN
      PERFORM * FROM public.validate_session(item->>'session_token');
      RAISE EXCEPTION 'Expired or changed-role token accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $$;
RESET ROLE;
ROLLBACK;
