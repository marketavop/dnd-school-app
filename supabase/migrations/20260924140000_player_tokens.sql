BEGIN;

-- Token-specific authorization. Identity comes from the session, never the URL.
CREATE FUNCTION app_private.require_token_access(p_session_token text, p_character_id uuid, p_map_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account record;
BEGIN
  SELECT * INTO STRICT account FROM app_private.require_session(p_session_token);
  IF NOT EXISTS (SELECT FROM app_private.users u WHERE u.role = 'player' AND u.character_id = p_character_id)
    OR (account.role = 'player' AND NOT EXISTS (
      SELECT FROM app_private.users u WHERE u.id = account.user_id AND u.character_id = p_character_id)) THEN
    RAISE EXCEPTION 'Unauthorized token' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT FROM app_private.maps m WHERE m.map_id = p_map_id) THEN
    RAISE EXCEPTION 'Unknown map' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION app_private.require_token_access(text, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.leader_player_tokens(p_session_token text, p_map_id text)
RETURNS TABLE (character_id uuid, name text, portrait_path text, x numeric, y numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  RETURN QUERY SELECT c.id, c.name, c.portrait_path, p.x::numeric, p.y::numeric
    FROM public.characters c
    LEFT JOIN public.token_positions p ON p.character_id = c.id AND p.map_id = p_map_id
    WHERE EXISTS (SELECT FROM app_private.users u WHERE u.role = 'player' AND u.character_id = c.id)
    ORDER BY c.name, c.id;
END;
$$;

CREATE FUNCTION public.player_token(p_session_token text, p_map_id text)
RETURNS TABLE (character_id uuid, name text, portrait_path text, x numeric, y numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account record;
BEGIN
  SELECT * INTO STRICT account FROM app_private.require_session(p_session_token, 'player');
  RETURN QUERY SELECT c.id, c.name, c.portrait_path, p.x::numeric, p.y::numeric
    FROM app_private.users u JOIN public.characters c ON c.id = u.character_id
    LEFT JOIN public.token_positions p ON p.character_id = c.id AND p.map_id = p_map_id
    WHERE u.id = account.user_id;
END;
$$;

CREATE FUNCTION public.add_token(p_session_token text, p_character_id uuid, p_map_id text, p_x numeric, p_y numeric)
RETURNS TABLE (x numeric, y numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_token_access(p_session_token, p_character_id, p_map_id);
  IF p_x IS NULL OR p_y IS NULL OR p_x::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_y::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Invalid coordinates' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.token_positions(character_id, map_id, x, y)
    VALUES (p_character_id, p_map_id, p_x, p_y) ON CONFLICT (character_id, map_id) DO NOTHING;
  RETURN QUERY SELECT p.x::numeric, p.y::numeric FROM public.token_positions p
    WHERE p.character_id = p_character_id AND p.map_id = p_map_id;
END;
$$;

CREATE FUNCTION public.set_token_position(p_session_token text, p_character_id uuid, p_map_id text, p_x numeric, p_y numeric)
RETURNS TABLE (x numeric, y numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_token_access(p_session_token, p_character_id, p_map_id);
  IF p_x IS NULL OR p_y IS NULL OR p_x::text IN ('NaN', 'Infinity', '-Infinity')
    OR p_y::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Invalid coordinates' USING ERRCODE = '22023';
  END IF;
  -- A late drop must not recreate a token removed by another client.
  RETURN QUERY UPDATE public.token_positions p SET x = p_x, y = p_y
    WHERE p.character_id = p_character_id AND p.map_id = p_map_id RETURNING p.x::numeric, p.y::numeric;
  IF NOT FOUND THEN RAISE EXCEPTION 'Token is not on this map' USING ERRCODE = '22023'; END IF;
END;
$$;

CREATE FUNCTION public.remove_token(p_session_token text, p_character_id uuid, p_map_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_private.require_token_access(p_session_token, p_character_id, p_map_id);
  DELETE FROM public.token_positions p WHERE p.character_id = p_character_id AND p.map_id = p_map_id;
END;
$$;

REVOKE ALL ON FUNCTION public.leader_player_tokens(text, text), public.player_token(text, text),
  public.add_token(text, uuid, text, numeric, numeric), public.set_token_position(text, uuid, text, numeric, numeric),
  public.remove_token(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leader_player_tokens(text, text), public.player_token(text, text),
  public.add_token(text, uuid, text, numeric, numeric), public.set_token_position(text, uuid, text, numeric, numeric),
  public.remove_token(text, uuid, text) TO anon;

-- Keep existing read access/publication for Postgres Changes. Block every direct
-- write, including any old column-level grants; only the checked RPCs can write.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.token_positions FROM PUBLIC, anon, authenticated;
DO $$ DECLARE col record; BEGIN
  FOR col IN SELECT attname FROM pg_attribute WHERE attrelid = 'public.token_positions'::regclass
    AND attnum > 0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE INSERT (%I), UPDATE (%I) ON public.token_positions FROM PUBLIC, anon, authenticated', col.attname, col.attname);
  END LOOP;
END $$;
ALTER TABLE public.token_positions REPLICA IDENTITY FULL;
NOTIFY pgrst, 'reload schema';
COMMIT;
