BEGIN;

-- Player journal access is exclusively through the session-checked functions below.
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.characters FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.player_character(p_session_token text, p_character_id uuid)
RETURNS TABLE (id uuid, user_id uuid, name text, portrait_path text, race_code text, class_code text,
  level integer, str integer, dex integer, con integer, int integer, wis integer, cha integer,
  xp integer, current_hp integer, max_hp integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account record;
BEGIN
  SELECT * INTO STRICT account FROM app_private.require_session(p_session_token, 'player');
  RETURN QUERY SELECT c.id, c.user_id, c.name, c.portrait_path, c.race_code, c.class_code,
    c.level, c.str, c.dex, c.con, c.int, c.wis, c.cha, c.xp, c.current_hp, c.max_hp
    FROM public.characters c
    JOIN app_private.users u ON u.id = account.user_id AND u.role = 'player'
      AND u.character_id = c.id
    WHERE c.id = p_character_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public.player_update_character(p_session_token text, p_character_id uuid, p_patch jsonb)
RETURNS TABLE (id uuid, user_id uuid, name text, portrait_path text, race_code text, class_code text,
  level integer, str integer, dex integer, con integer, int integer, wis integer, cha integer,
  xp integer, current_hp integer, max_hp integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account record; updated public.characters%ROWTYPE;
  allowed constant text[] := ARRAY['name','portrait_path','race_code','class_code','level','str','dex','con','int','wis','cha','xp','current_hp','max_hp'];
  key text;
BEGIN
  SELECT * INTO STRICT account FROM app_private.require_session(p_session_token, 'player');
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object'
     OR p_patch = '{}'::jsonb OR (SELECT count(*) FROM jsonb_object_keys(p_patch)) <> 1 THEN
    RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_object_keys(p_patch) INTO key;
  IF NOT (key = ANY(allowed)) THEN
    RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501';
  END IF;
  UPDATE public.characters c
    SET name = CASE WHEN key = 'name' THEN p_patch->>'name' ELSE c.name END,
        portrait_path = CASE WHEN key = 'portrait_path' THEN p_patch->>'portrait_path' ELSE c.portrait_path END,
        race_code = CASE WHEN key = 'race_code' THEN NULLIF(p_patch->>'race_code','') ELSE c.race_code END,
        class_code = CASE WHEN key = 'class_code' THEN NULLIF(p_patch->>'class_code','') ELSE c.class_code END,
        level = CASE WHEN key = 'level' THEN (p_patch->>'level')::integer ELSE c.level END,
        str = CASE WHEN key = 'str' THEN (p_patch->>'str')::integer ELSE c.str END,
        dex = CASE WHEN key = 'dex' THEN (p_patch->>'dex')::integer ELSE c.dex END,
        con = CASE WHEN key = 'con' THEN (p_patch->>'con')::integer ELSE c.con END,
        int = CASE WHEN key = 'int' THEN (p_patch->>'int')::integer ELSE c.int END,
        wis = CASE WHEN key = 'wis' THEN (p_patch->>'wis')::integer ELSE c.wis END,
        cha = CASE WHEN key = 'cha' THEN (p_patch->>'cha')::integer ELSE c.cha END,
        xp = CASE WHEN key = 'xp' THEN (p_patch->>'xp')::integer ELSE c.xp END,
        current_hp = CASE WHEN key = 'current_hp' THEN (p_patch->>'current_hp')::integer
          WHEN key = 'max_hp' AND c.current_hp IS NOT NULL AND (p_patch->>'max_hp')::integer < c.current_hp
            THEN (p_patch->>'max_hp')::integer ELSE c.current_hp END,
        max_hp = CASE WHEN key = 'max_hp' THEN (p_patch->>'max_hp')::integer ELSE c.max_hp END
    WHERE c.id = p_character_id AND EXISTS (
      SELECT FROM app_private.users u WHERE u.id = account.user_id AND u.role = 'player' AND u.character_id = c.id)
    RETURNING c.* INTO updated;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT updated.id, updated.user_id, updated.name, updated.portrait_path,
    updated.race_code, updated.class_code, updated.level, updated.str, updated.dex,
    updated.con, updated.int, updated.wis, updated.cha, updated.xp, updated.current_hp, updated.max_hp;
END;
$$;

REVOKE ALL ON FUNCTION public.player_character(text, uuid), public.player_update_character(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_character(text, uuid), public.player_update_character(text, uuid, jsonb) TO anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
