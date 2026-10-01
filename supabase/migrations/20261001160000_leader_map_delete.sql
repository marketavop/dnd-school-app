BEGIN;

-- Both operations serialize on the singleton BEFORE inspecting the target map.
CREATE OR REPLACE FUNCTION public.leader_set_active_map(p_session_token text, p_map_id text)
RETURNS TABLE (active_map_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  PERFORM 1 FROM public.game_state g WHERE g.id = 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing game state'; END IF;
  IF NOT EXISTS (SELECT FROM app_private.maps m WHERE m.map_id = p_map_id) THEN
    RAISE EXCEPTION 'Unknown prepared map' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY UPDATE public.game_state g SET active_map_id = p_map_id
    WHERE g.id = 1 RETURNING g.active_map_id;
END;
$$;

CREATE FUNCTION public.leader_delete_map(p_session_token text, p_map_id text)
RETURNS TABLE (image_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_map text; original_path text;
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  SELECT g.active_map_id INTO current_map FROM public.game_state g
    WHERE g.id = 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing game state'; END IF;
  SELECT m.image_path INTO original_path FROM app_private.maps m
    WHERE m.map_id = p_map_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Map not found' USING ERRCODE = 'P0002'; END IF;
  IF current_map = p_map_id THEN
    RAISE EXCEPTION 'Active map cannot be deleted' USING ERRCODE = 'PT409';
  END IF;
  DELETE FROM app_private.npc_placements WHERE map_id = p_map_id;
  IF pg_catalog.to_regclass('app_private.npc_tokens_5a_backup') IS NOT NULL THEN
    EXECUTE 'DELETE FROM app_private.npc_tokens_5a_backup WHERE map_id = $1' USING p_map_id;
  END IF;
  -- Existing token_positions -> map_config ON DELETE CASCADE removes PC positions.
  DELETE FROM public.map_config WHERE map_id = p_map_id;
  DELETE FROM app_private.maps WHERE map_id = p_map_id;
  RETURN QUERY SELECT original_path;
END;
$$;
REVOKE ALL ON FUNCTION public.leader_delete_map(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leader_delete_map(text, text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
