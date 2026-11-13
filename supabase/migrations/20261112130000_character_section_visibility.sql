BEGIN;

-- One shared setting for the whole group; section IDs are validated by the RPC.
CREATE TABLE app_private.character_section_visibility (
  section_id text PRIMARY KEY,
  is_visible boolean NOT NULL
);
ALTER TABLE app_private.character_section_visibility ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.character_section_visibility FROM PUBLIC, anon, authenticated;
INSERT INTO app_private.character_section_visibility (section_id, is_visible)
VALUES ('abilities', true)
ON CONFLICT (section_id) DO NOTHING;

CREATE FUNCTION public.character_section_visibility(p_session_token text)
RETURNS TABLE (section_id text, is_visible boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token);
  RETURN QUERY SELECT s.section_id, s.is_visible
    FROM app_private.character_section_visibility s ORDER BY s.section_id;
END;
$$;

CREATE FUNCTION public.leader_set_character_section_visibility(
  p_session_token text, p_section_id text, p_is_visible boolean
)
RETURNS TABLE (section_id text, is_visible boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  IF p_section_id IS NULL OR p_section_id !~ '^[a-z][a-z0-9_]*$' OR p_is_visible IS NULL THEN
    RAISE EXCEPTION 'Invalid character section visibility' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY INSERT INTO app_private.character_section_visibility AS s (section_id, is_visible)
    VALUES (p_section_id, p_is_visible)
    ON CONFLICT (section_id) DO UPDATE SET is_visible = EXCLUDED.is_visible
    RETURNING s.section_id, s.is_visible;
END;
$$;

REVOKE ALL ON FUNCTION public.character_section_visibility(text),
  public.leader_set_character_section_visibility(text, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.character_section_visibility(text),
  public.leader_set_character_section_visibility(text, text, boolean) TO anon, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
