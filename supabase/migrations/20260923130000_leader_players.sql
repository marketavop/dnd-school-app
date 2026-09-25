BEGIN;
CREATE FUNCTION public.leader_players(p_session_token text)
RETURNS TABLE (character_id uuid, name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  RETURN QUERY SELECT c.id, c.name FROM public.characters c
    WHERE EXISTS (SELECT FROM app_private.users u WHERE u.role = 'player' AND u.character_id = c.id)
    ORDER BY c.name, c.id;
END;
$$;
REVOKE ALL ON FUNCTION public.leader_players(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leader_players(text) TO anon;

CREATE FUNCTION public.leader_character(p_session_token text, p_character_id uuid)
RETURNS TABLE (id uuid, name text, portrait_path text, race_code text, class_code text,
  level integer, str integer, dex integer, con integer, int integer, wis integer,
  cha integer, xp integer, current_hp integer, max_hp integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  RETURN QUERY SELECT c.id, c.name, c.portrait_path, c.race_code, c.class_code,
    c.level, c.str, c.dex, c.con, c.int, c.wis, c.cha, c.xp, c.current_hp, c.max_hp
    FROM public.characters c
    WHERE c.id = p_character_id AND EXISTS (
      SELECT FROM app_private.users u WHERE u.role = 'player' AND u.character_id = c.id);
END;
$$;
REVOKE ALL ON FUNCTION public.leader_character(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leader_character(text, uuid) TO anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
