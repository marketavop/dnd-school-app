BEGIN;

-- Keep the existing signature and grants; leaders may only read character portraits.
CREATE OR REPLACE FUNCTION public.portrait_reference(
  p_session_token text, p_entity_type text, p_entity_id uuid,
  p_for_write boolean DEFAULT false, p_map_id text DEFAULT NULL
)
RETURNS TABLE (object_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account record; allowed boolean := false;
BEGIN
  SELECT * INTO STRICT account FROM app_private.require_session(p_session_token);
  IF p_for_write IS NULL OR p_entity_type IS NULL OR p_entity_type NOT IN ('character', 'npc') OR p_entity_id IS NULL THEN
    RAISE EXCEPTION 'Invalid portrait request' USING ERRCODE = '22023';
  END IF;
  IF account.role = 'leader' THEN
    allowed := NOT p_for_write OR p_entity_type = 'npc';
  ELSIF account.role = 'player' THEN
    IF p_entity_type = 'character' THEN
      allowed := EXISTS (SELECT FROM app_private.user_characters uc
        WHERE uc.user_id = account.user_id AND uc.character_id = p_entity_id);
      IF NOT allowed AND NOT p_for_write AND p_map_id IS NOT NULL THEN
        allowed := EXISTS (SELECT FROM public.player_token(p_session_token, p_map_id) t
          WHERE t.character_id = p_entity_id);
      END IF;
    ELSIF NOT p_for_write AND p_map_id IS NOT NULL THEN
      allowed := EXISTS (SELECT FROM public.map_npcs(p_session_token, p_map_id) n
        WHERE n.npc_id = p_entity_id);
    END IF;
  END IF;
  IF NOT allowed THEN
    RAISE EXCEPTION 'Invalid or unauthorized portrait' USING ERRCODE = '42501';
  END IF;
  IF p_entity_type = 'character' THEN
    RETURN QUERY SELECT c.portrait_path FROM public.characters c WHERE c.id = p_entity_id;
  ELSE
    RETURN QUERY SELECT n.image_url FROM app_private.npcs n WHERE n.id = p_entity_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or unauthorized portrait' USING ERRCODE = '42501';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
