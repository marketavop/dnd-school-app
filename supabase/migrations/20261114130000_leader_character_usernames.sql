BEGIN;

DROP FUNCTION public.leader_players(text);
CREATE FUNCTION public.leader_players(p_session_token text)
RETURNS TABLE (character_id uuid, name text, username text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  RETURN QUERY SELECT c.id, c.name, owner.username
    FROM public.characters c
    LEFT JOIN LATERAL (
      SELECT u.username
      FROM app_private.user_characters uc
      JOIN app_private.users u ON u.id = uc.user_id
      WHERE u.role = 'player' AND uc.character_id = c.id
      ORDER BY u.id
      LIMIT 1
    ) owner ON true
    WHERE EXISTS (SELECT FROM app_private.user_characters uc
      JOIN app_private.users u ON u.id = uc.user_id
      WHERE u.role = 'player' AND uc.character_id = c.id)
    ORDER BY c.name, c.id;
END;
$$;
REVOKE ALL ON FUNCTION public.leader_players(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leader_players(text) TO anon;

DROP FUNCTION public.leader_player_tokens(text, text);
CREATE FUNCTION public.leader_player_tokens(p_session_token text, p_map_id text)
RETURNS TABLE (character_id uuid, name text, username text, portrait_path text, x numeric, y numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  RETURN QUERY SELECT c.id, c.name, owner.username, c.portrait_path, p.x::numeric, p.y::numeric
    FROM public.characters c
    LEFT JOIN public.token_positions p ON p.character_id = c.id AND p.map_id = p_map_id
    LEFT JOIN LATERAL (
      SELECT u.username
      FROM app_private.user_characters uc
      JOIN app_private.users u ON u.id = uc.user_id
      WHERE u.role = 'player' AND uc.character_id = c.id
      ORDER BY u.id
      LIMIT 1
    ) owner ON true
    WHERE EXISTS (SELECT FROM app_private.user_characters uc
      JOIN app_private.users u ON u.id = uc.user_id
      WHERE u.role = 'player' AND uc.character_id = c.id)
    ORDER BY c.name, c.id;
END;
$$;
REVOKE ALL ON FUNCTION public.leader_player_tokens(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leader_player_tokens(text, text) TO anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
