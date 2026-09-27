BEGIN;
LOCK TABLE app_private.npc_tokens IN ACCESS EXCLUSIVE MODE;
CREATE TABLE app_private.npcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 120),
  image_url text CHECK (image_url IS NULL OR (length(image_url) <= 2048 AND image_url ~ '^https?://'))
);
CREATE TABLE app_private.npc_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id uuid NOT NULL REFERENCES app_private.npcs(id) ON DELETE CASCADE,
  map_id text NOT NULL REFERENCES app_private.maps(map_id),
  x numeric NOT NULL CHECK (x >= 0 AND x::text NOT IN ('NaN','Infinity','-Infinity')),
  y numeric NOT NULL CHECK (y >= 0 AND y::text NOT IN ('NaN','Infinity','-Infinity')),
  visible boolean NOT NULL DEFAULT true,
  UNIQUE (npc_id, map_id)
);
ALTER TABLE app_private.npcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.npc_placements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.npcs, app_private.npc_placements FROM PUBLIC, anon, authenticated;

-- Preserve every old row independently, including blank names and hidden state.
INSERT INTO app_private.npcs(id,name,image_url) SELECT id,name,image_url FROM app_private.npc_tokens;
INSERT INTO app_private.npc_placements(id,npc_id,map_id,x,y,visible)
  SELECT id,id,map_id,x,y,visible FROM app_private.npc_tokens;
DO $$ BEGIN
  IF EXISTS (
    SELECT id,name,image_url,map_id,x,y,visible FROM app_private.npc_tokens
    EXCEPT
    SELECT p.id,n.name,n.image_url,p.map_id,p.x,p.y,p.visible
      FROM app_private.npc_placements p JOIN app_private.npcs n ON n.id=p.npc_id
  ) THEN RAISE EXCEPTION 'NPC migration verification failed'; END IF;
END; $$;

DROP FUNCTION public.map_npcs(text,text);
DROP FUNCTION public.leader_add_npc(text,text,text,text,numeric,numeric,boolean);
DROP FUNCTION public.leader_remove_npc(text,uuid);
DROP FUNCTION public.leader_set_npc_position(text,uuid,numeric,numeric);
DROP FUNCTION public.leader_set_npc_visibility(text,uuid,boolean);
DROP TRIGGER npc_changes ON app_private.npc_tokens;
ALTER TABLE app_private.npc_tokens RENAME TO npc_tokens_5a_backup;
-- Retained snapshot only: no public RPC or realtime reads/writes this table.

CREATE FUNCTION public.leader_npcs(p_session_token text)
RETURNS TABLE(id uuid,name text,image_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token,'leader');
  RETURN QUERY SELECT n.id,n.name,n.image_url FROM app_private.npcs n ORDER BY n.id;
END; $$;
CREATE FUNCTION public.leader_create_npc(p_session_token text,p_name text,p_image_url text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token,'leader');
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'Name required' USING ERRCODE='22023'; END IF;
  INSERT INTO app_private.npcs(name,image_url) VALUES (btrim(p_name),nullif(btrim(p_image_url),'')) RETURNING id INTO result;
  RETURN result;
END; $$;
CREATE FUNCTION public.leader_delete_npc(p_session_token text,p_npc_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token,'leader');
  DELETE FROM app_private.npcs WHERE id=p_npc_id;
END; $$;
CREATE FUNCTION public.map_npcs(p_session_token text,p_map_id text)
RETURNS TABLE(id uuid,npc_id uuid,map_id text,name text,image_url text,x numeric,y numeric,visible boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account record;
BEGIN
  SELECT * INTO STRICT account FROM app_private.require_session(p_session_token);
  IF account.role NOT IN ('leader','player') THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT p.id,p.npc_id,p.map_id,n.name,n.image_url,p.x,p.y,p.visible
    FROM app_private.npc_placements p JOIN app_private.npcs n ON n.id=p.npc_id
    WHERE p.map_id=p_map_id AND (account.role='leader' OR (p.visible AND EXISTS (
      SELECT FROM public.game_state g WHERE g.id=1 AND g.active_map_id=p.map_id))) ORDER BY p.id;
END; $$;
CREATE FUNCTION public.leader_add_npc_to_map(p_session_token text,p_npc_id uuid,p_map_id text,p_x numeric,p_y numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token,'leader');
  IF NOT EXISTS (SELECT FROM public.game_state WHERE id=1 AND active_map_id=p_map_id) THEN
    RAISE EXCEPTION 'Map is not active' USING ERRCODE='22023';
  END IF;
  INSERT INTO app_private.npc_placements(npc_id,map_id,x,y) VALUES (p_npc_id,p_map_id,p_x,p_y)
    ON CONFLICT (npc_id,map_id) DO NOTHING RETURNING id INTO result;
  IF result IS NULL THEN SELECT id INTO result FROM app_private.npc_placements WHERE npc_id=p_npc_id AND map_id=p_map_id; END IF;
  RETURN result;
END; $$;
CREATE FUNCTION public.leader_remove_npc_from_map(p_session_token text,p_placement_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token,'leader');
  DELETE FROM app_private.npc_placements WHERE id=p_placement_id;
END; $$;
CREATE FUNCTION public.leader_set_npc_position(p_session_token text,p_placement_id uuid,p_x numeric,p_y numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token,'leader');
  UPDATE app_private.npc_placements SET x=p_x,y=p_y WHERE id=p_placement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Placement not found' USING ERRCODE='22023'; END IF;
END; $$;
CREATE FUNCTION public.leader_set_npc_visibility(p_session_token text,p_placement_id uuid,p_visible boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token,'leader');
  UPDATE app_private.npc_placements SET visible=p_visible WHERE id=p_placement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Placement not found' USING ERRCODE='22023'; END IF;
END; $$;
CREATE TRIGGER npc_changes AFTER INSERT OR UPDATE OR DELETE ON app_private.npc_placements
FOR EACH STATEMENT EXECUTE FUNCTION app_private.notify_npcs();
-- The same empty notification also refreshes leader lists after create/delete.
CREATE TRIGGER npc_definition_changes AFTER INSERT OR DELETE ON app_private.npcs
FOR EACH STATEMENT EXECUTE FUNCTION app_private.notify_npcs();
REVOKE ALL ON FUNCTION public.leader_npcs(text),public.leader_create_npc(text,text,text),
  public.leader_delete_npc(text,uuid),public.map_npcs(text,text),
  public.leader_add_npc_to_map(text,uuid,text,numeric,numeric),public.leader_remove_npc_from_map(text,uuid),
  public.leader_set_npc_position(text,uuid,numeric,numeric),public.leader_set_npc_visibility(text,uuid,boolean)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.leader_npcs(text),public.leader_create_npc(text,text,text),
  public.leader_delete_npc(text,uuid),public.map_npcs(text,text),
  public.leader_add_npc_to_map(text,uuid,text,numeric,numeric),public.leader_remove_npc_from_map(text,uuid),
  public.leader_set_npc_position(text,uuid,numeric,numeric),public.leader_set_npc_visibility(text,uuid,boolean) TO anon;
NOTIFY pgrst,'reload schema';
COMMIT;
