BEGIN;
-- Change only the player read contract; write ownership checks are unchanged.
CREATE OR REPLACE FUNCTION public.player_token(p_session_token text, p_map_id text)
RETURNS TABLE (character_id uuid, name text, portrait_path text, x numeric, y numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account record;
BEGIN
  SELECT * INTO STRICT account FROM app_private.require_session(p_session_token, 'player');
  IF NOT EXISTS (SELECT FROM public.game_state g WHERE g.id = 1 AND g.active_map_id = p_map_id) THEN
    RAISE EXCEPTION 'Map is not active' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT c.id, c.name, c.portrait_path, p.x::numeric, p.y::numeric
    FROM public.characters c
    LEFT JOIN public.token_positions p ON p.character_id = c.id AND p.map_id = p_map_id
    WHERE EXISTS (SELECT FROM app_private.user_characters uc JOIN app_private.users u ON u.id = uc.user_id
      WHERE uc.character_id = c.id AND u.role = 'player')
    AND (p.character_id IS NOT NULL OR EXISTS (SELECT FROM app_private.user_characters own
      WHERE own.character_id = c.id AND own.user_id = account.user_id))
    ORDER BY c.name, c.id;
END; $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
