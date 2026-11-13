BEGIN;

CREATE OR REPLACE FUNCTION public.leader_set_character_section_visibility(
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
    ON CONFLICT ON CONSTRAINT character_section_visibility_pkey
    DO UPDATE SET is_visible = EXCLUDED.is_visible
    RETURNING s.section_id, s.is_visible;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
