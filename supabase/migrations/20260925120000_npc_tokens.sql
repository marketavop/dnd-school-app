BEGIN;
CREATE TABLE app_private.npc_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id text NOT NULL REFERENCES app_private.maps(map_id),
  name text NOT NULL DEFAULT '' CHECK (length(name) <= 120),
  image_url text CHECK (image_url IS NULL OR (length(image_url) <= 2048 AND image_url ~ '^https?://')),
  x numeric NOT NULL CHECK (x >= 0 AND x::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  y numeric NOT NULL CHECK (y >= 0 AND y::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  visible boolean NOT NULL DEFAULT true
);
ALTER TABLE app_private.npc_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.npc_tokens FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.map_npcs(p_session_token text, p_map_id text)
RETURNS SETOF app_private.npc_tokens
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account record;
BEGIN
  SELECT * INTO STRICT account FROM app_private.require_session(p_session_token);
  IF account.role = 'leader' THEN
    RETURN QUERY SELECT n.* FROM app_private.npc_tokens n WHERE n.map_id = p_map_id ORDER BY n.id;
  ELSIF account.role = 'player' THEN
    RETURN QUERY SELECT n.* FROM app_private.npc_tokens n
      WHERE n.map_id = p_map_id AND n.visible
      AND EXISTS (SELECT FROM public.game_state g WHERE g.id = 1 AND g.active_map_id = n.map_id)
      ORDER BY n.id;
  ELSE RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501'; END IF;
END;
$$;

CREATE FUNCTION public.leader_add_npc(p_session_token text, p_map_id text, p_name text,
  p_image_url text, p_x numeric, p_y numeric, p_visible boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  IF NOT EXISTS (SELECT FROM public.game_state WHERE id = 1 AND active_map_id = p_map_id) THEN
    RAISE EXCEPTION 'Map is not active' USING ERRCODE = '22023';
  END IF;
  INSERT INTO app_private.npc_tokens(map_id, name, image_url, x, y, visible)
    VALUES (p_map_id, coalesce(btrim(p_name), ''), nullif(btrim(p_image_url), ''), p_x, p_y, p_visible)
    RETURNING id INTO result;
  RETURN result;
END;
$$;
CREATE FUNCTION public.leader_set_npc_position(p_session_token text, p_npc_id uuid, p_x numeric, p_y numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  UPDATE app_private.npc_tokens SET x = p_x, y = p_y WHERE id = p_npc_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NPC not found' USING ERRCODE = '22023'; END IF;
END;
$$;
CREATE FUNCTION public.leader_set_npc_visibility(p_session_token text, p_npc_id uuid, p_visible boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  UPDATE app_private.npc_tokens SET visible = p_visible WHERE id = p_npc_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NPC not found' USING ERRCODE = '22023'; END IF;
END;
$$;
CREATE FUNCTION public.leader_remove_npc(p_session_token text, p_npc_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  DELETE FROM app_private.npc_tokens WHERE id = p_npc_id;
END;
$$;

-- No NPC rows, IDs, map IDs or images are broadcast. Clients re-read through
-- session-checked RPC. The private table is NOT in supabase_realtime.
CREATE FUNCTION app_private.notify_npcs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM realtime.send('{}'::jsonb, 'changed', 'npc-changes', false);
  RETURN NULL;
END;
$$;
CREATE TRIGGER npc_changes AFTER INSERT OR UPDATE OR DELETE ON app_private.npc_tokens
FOR EACH STATEMENT EXECUTE FUNCTION app_private.notify_npcs();
REVOKE ALL ON FUNCTION app_private.notify_npcs() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.map_npcs(text,text),
  public.leader_add_npc(text,text,text,text,numeric,numeric,boolean),
  public.leader_set_npc_position(text,uuid,numeric,numeric),
  public.leader_set_npc_visibility(text,uuid,boolean), public.leader_remove_npc(text,uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.map_npcs(text,text),
  public.leader_add_npc(text,text,text,text,numeric,numeric,boolean),
  public.leader_set_npc_position(text,uuid,numeric,numeric),
  public.leader_set_npc_visibility(text,uuid,boolean), public.leader_remove_npc(text,uuid) TO anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
