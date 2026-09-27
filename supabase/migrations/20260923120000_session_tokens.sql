BEGIN;

CREATE TABLE app_private.sessions (
  token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
  user_id uuid NOT NULL REFERENCES app_private.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('player', 'leader')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_expires_at_idx ON app_private.sessions (expires_at);
ALTER TABLE app_private.sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.sessions FROM PUBLIC, anon, authenticated;

-- The return type changes, so replace the function atomically without CASCADE.
DROP FUNCTION public.login(text, text);
CREATE FUNCTION public.login(p_username text, p_password text)
RETURNS TABLE (user_id uuid, role text, character_id uuid, session_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  account app_private.users%ROWTYPE;
  candidate_hash text;
  new_token text;
  issued_at timestamptz;
BEGIN
  IF p_username IS NULL OR char_length(p_username) NOT BETWEEN 1 AND 100
     OR p_password IS NULL OR octet_length(p_password) NOT BETWEEN 1 AND 72 THEN
    RETURN;
  END IF;
  SELECT u.* INTO account FROM app_private.users u WHERE u.username = p_username;
  candidate_hash := extensions.crypt(p_password, coalesce(account.password_hash,
    '$2a$12$......................JJuKLOX9OOwo5PceZZXSkaLDvdmgb82'));
  IF account.id IS NOT NULL AND candidate_hash = account.password_hash THEN
    new_token := encode(extensions.gen_random_bytes(32), 'hex');
    issued_at := clock_timestamp();
    DELETE FROM app_private.sessions s WHERE s.expires_at <= issued_at;
    INSERT INTO app_private.sessions (token_hash, user_id, role, created_at, expires_at)
    VALUES (extensions.digest(new_token, 'sha256'), account.id, account.role,
      issued_at, issued_at + interval '30 minutes');
    RETURN QUERY SELECT account.id, account.role, account.character_id, new_token;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.login(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login(text, text) TO anon;

-- Future privileged RPCs must call this before reading or changing game data.
-- Required role is a server-side constant, never a role supplied by the client.
CREATE FUNCTION app_private.require_session(p_session_token text, p_required_role text DEFAULT NULL)
RETURNS TABLE (user_id uuid, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_session_token IS NULL OR p_session_token !~ '^[0-9a-f]{64}$'
     OR (p_required_role IS NOT NULL AND p_required_role NOT IN ('player', 'leader')) THEN
    RAISE EXCEPTION 'Invalid or unauthorized session' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT s.user_id, s.role
    FROM app_private.sessions s
    JOIN app_private.users u ON u.id = s.user_id AND u.role = s.role
    WHERE s.token_hash = extensions.digest(p_session_token, 'sha256')
      AND s.expires_at > clock_timestamp()
      AND (p_required_role IS NULL OR s.role = p_required_role);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or unauthorized session' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app_private.require_session(text, text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.validate_session(p_session_token text)
RETURNS TABLE (user_id uuid, role text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.user_id, s.role FROM app_private.require_session(p_session_token) s;
$$;
REVOKE ALL ON FUNCTION public.validate_session(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_session(text) TO anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
