BEGIN;
CREATE FUNCTION public.active_map_metadata(p_map_id text)
RETURNS TABLE (map_id text, name text, image_path text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.map_id, m.name, m.image_path
  FROM app_private.maps m JOIN public.game_state g ON g.active_map_id = m.map_id
  WHERE g.id = 1 AND m.map_id = p_map_id;
$$;
REVOKE ALL ON FUNCTION public.active_map_metadata(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.active_map_metadata(text) TO anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
