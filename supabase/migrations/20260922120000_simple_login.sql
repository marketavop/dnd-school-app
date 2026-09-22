BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Separate from auth.users and the existing characters.user_id relationship.
CREATE SCHEMA app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
CREATE TABLE app_private.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE CHECK (username = btrim(username) AND char_length(username) BETWEEN 1 AND 100),
  password_hash text NOT NULL CHECK (password_hash ~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$'),
  role text NOT NULL CHECK (role IN ('player', 'leader')),
  character_id uuid REFERENCES public.characters(id) ON DELETE SET NULL
);
ALTER TABLE app_private.users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.users FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.login(p_username text, p_password text)
RETURNS TABLE (user_id uuid, role text, character_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  account app_private.users%ROWTYPE;
  candidate_hash text;
BEGIN
  IF p_username IS NULL OR char_length(p_username) NOT BETWEEN 1 AND 100
     OR p_password IS NULL OR octet_length(p_password) NOT BETWEEN 1 AND 72 THEN
    RETURN;
  END IF;
  SELECT u.* INTO account FROM app_private.users u WHERE u.username = p_username;
  -- A missing account still performs the same bcrypt work as a wrong password.
  candidate_hash := extensions.crypt(p_password, coalesce(account.password_hash,
    '$2a$12$......................JJuKLOX9OOwo5PceZZXSkaLDvdmgb82'));
  IF account.id IS NOT NULL AND candidate_hash = account.password_hash THEN
    RETURN QUERY SELECT account.id, account.role, account.character_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.login(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login(text, text) TO anon;
COMMIT;
