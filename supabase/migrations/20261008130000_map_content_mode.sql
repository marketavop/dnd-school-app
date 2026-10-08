BEGIN;

ALTER TABLE public.map_config
  ADD COLUMN content_mode text NOT NULL DEFAULT 'map'
  CHECK (content_mode IN ('map', 'image'));

DROP FUNCTION public.leader_maps(text);
CREATE FUNCTION public.leader_maps(p_session_token text)
RETURNS TABLE (map_id text, name text, image_path text, cell_size numeric, content_mode text, is_active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  RETURN QUERY
    SELECT m.map_id, m.name, m.image_path, c.cell_size::numeric, c.content_mode,
      EXISTS (SELECT FROM public.game_state g WHERE g.id = 1 AND g.active_map_id = m.map_id)
    FROM app_private.maps m
    LEFT JOIN public.map_config c ON c.map_id = m.map_id
    ORDER BY m.name, m.map_id;
END;
$$;
REVOKE ALL ON FUNCTION public.leader_maps(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leader_maps(text) TO anon;

CREATE FUNCTION public.leader_set_map_content_mode(
  p_session_token text, p_map_id text, p_content_mode text
)
RETURNS TABLE (content_mode text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  IF p_content_mode IS NULL OR p_content_mode NOT IN ('map', 'image') THEN
    RAISE EXCEPTION 'Invalid map content mode' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY UPDATE public.map_config c
    SET content_mode = p_content_mode
    WHERE c.map_id = p_map_id
    RETURNING c.content_mode;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing map config'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.leader_set_map_content_mode(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leader_set_map_content_mode(text, text, text) TO anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
