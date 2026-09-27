BEGIN;
-- Only newly issued tokens get the longer TTL; existing rows are untouched.
CREATE OR REPLACE FUNCTION public.login(p_username text, p_password text)
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
      issued_at, issued_at + interval '8 hours');
    RETURN QUERY SELECT account.id, account.role, account.character_id, new_token;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.login(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login(text, text) TO anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
