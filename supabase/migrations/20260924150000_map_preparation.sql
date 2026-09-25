BEGIN;
CREATE FUNCTION public.leader_set_map_cell_size(p_session_token text, p_map_id text, p_cell_size numeric)
RETURNS TABLE (cell_size numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  IF NOT EXISTS (SELECT FROM app_private.maps m WHERE m.map_id = p_map_id) THEN
    RAISE EXCEPTION 'Unknown map' USING ERRCODE = '22023';
  END IF;
  IF p_cell_size IS NULL OR NOT (p_cell_size >= 20 AND p_cell_size <= 300) THEN
    RAISE EXCEPTION 'Cell size must be between 20 and 300' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY UPDATE public.map_config c SET cell_size = p_cell_size
    WHERE c.map_id = p_map_id RETURNING c.cell_size::numeric;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing map config'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.leader_set_map_cell_size(text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leader_set_map_cell_size(text, text, numeric) TO anon;
-- Close the old direct-write route; leave reads and realtime unchanged.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.map_config FROM PUBLIC, anon, authenticated;
DO $$ DECLARE col record; BEGIN
  FOR col IN SELECT attname FROM pg_attribute WHERE attrelid = 'public.map_config'::regclass
    AND attnum > 0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE INSERT (%I), UPDATE (%I) ON public.map_config FROM PUBLIC, anon, authenticated', col.attname, col.attname);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
