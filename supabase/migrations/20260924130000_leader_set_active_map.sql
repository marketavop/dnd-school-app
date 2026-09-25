BEGIN;
CREATE FUNCTION public.leader_set_active_map(p_session_token text, p_map_id text)
RETURNS TABLE (active_map_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  IF NOT EXISTS (SELECT FROM app_private.maps m WHERE m.map_id = p_map_id) THEN
    RAISE EXCEPTION 'Unknown prepared map' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY UPDATE public.game_state g SET active_map_id = p_map_id
    WHERE g.id = 1 RETURNING g.active_map_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing game state'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.leader_set_active_map(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leader_set_active_map(text, text) TO anon;
-- Keep SELECT/realtime, but eliminate the old direct-write bypass.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.game_state FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, active_map_id), UPDATE (id, active_map_id) ON public.game_state FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
