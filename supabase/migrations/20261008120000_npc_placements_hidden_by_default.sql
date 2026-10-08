BEGIN;

-- Only future placements change; existing visibility is preserved.
ALTER TABLE app_private.npc_placements ALTER COLUMN visible SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.leader_add_npc_to_map(p_session_token text,p_npc_id uuid,p_map_id text,p_x numeric,p_y numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token,'leader');
  IF NOT EXISTS (SELECT FROM public.game_state WHERE id=1 AND active_map_id=p_map_id) THEN
    RAISE EXCEPTION 'Map is not active' USING ERRCODE='22023';
  END IF;
  INSERT INTO app_private.npc_placements(npc_id,map_id,x,y,visible) VALUES (p_npc_id,p_map_id,p_x,p_y,false)
    ON CONFLICT (npc_id,map_id) DO NOTHING RETURNING id INTO result;
  IF result IS NULL THEN SELECT id INTO result FROM app_private.npc_placements WHERE npc_id=p_npc_id AND map_id=p_map_id; END IF;
  RETURN result;
END; $$;

NOTIFY pgrst,'reload schema';
COMMIT;
