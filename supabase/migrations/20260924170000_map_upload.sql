BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('maps', 'maps', true, 52428800, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp'];

CREATE FUNCTION public.leader_create_uploaded_map(
  p_session_token text, p_map_id text, p_name text, p_image_path text
)
RETURNS TABLE (map_id text, name text, image_path text, cell_size numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  IF p_map_id IS NULL OR p_map_id !~ '^[a-z0-9][a-z0-9-]{0,62}$'
    OR p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 120
    OR p_image_path IS NULL OR p_image_path !~ '^maps/[0-9a-f-]+\.(png|jpg|jpeg|webp)$' THEN
    RAISE EXCEPTION 'Invalid uploaded map metadata' USING ERRCODE = '22023';
  END IF;
  INSERT INTO app_private.maps(map_id, name, image_path)
    VALUES (p_map_id, btrim(p_name), p_image_path);
  INSERT INTO public.map_config(map_id, cell_size) VALUES (p_map_id, 100);
  RETURN QUERY SELECT p_map_id, btrim(p_name), p_image_path, 100::numeric;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Map id already exists' USING ERRCODE = '23505';
END;
$$;
REVOKE ALL ON FUNCTION public.leader_create_uploaded_map(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leader_create_uploaded_map(text, text, text, text) TO anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
