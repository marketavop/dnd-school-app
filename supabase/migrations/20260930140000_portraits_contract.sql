BEGIN;

-- IMG-00 confirmed no existing references. Fail rather than discard unexpected data.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('portraits', 'portraits', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']);
-- No client Storage policies are added. Only the trusted service may access objects.

ALTER TABLE public.characters ADD CONSTRAINT characters_portrait_path_check CHECK (
  portrait_path IS NULL OR portrait_path ~ (
    '^characters/' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  )
);
ALTER TABLE app_private.npcs DROP CONSTRAINT npcs_image_url_check;
ALTER TABLE app_private.npcs ADD CONSTRAINT npcs_image_url_check CHECK (
  image_url IS NULL OR image_url ~ (
    '^npcs/' || id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  )
);
COMMENT ON COLUMN public.characters.portrait_path IS 'NULL or bucket-relative portraits path: characters/<id>/<upload UUID>.(jpg|png|webp)';
COMMENT ON COLUMN app_private.npcs.image_url IS 'NULL or bucket-relative portraits path: npcs/<id>/<upload UUID>.(jpg|png|webp); not a URL';

-- Public schema makes these callable through PostgREST; grants make them internal.
-- p_for_write selects stricter edit authorization before a future upload.
CREATE FUNCTION public.portrait_reference(
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
    allowed := true;
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

CREATE FUNCTION public.portrait_change_reference(
  p_session_token text, p_entity_type text, p_entity_id uuid,
  p_expected_path text, p_new_path text
)
RETURNS TABLE (old_path text, new_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE previous_path text;
BEGIN
  -- Reject unauthorized requests before taking a row lock.
  PERFORM * FROM public.portrait_reference(p_session_token, p_entity_type, p_entity_id, true);
  IF p_entity_type = 'character' THEN
    SELECT c.portrait_path INTO previous_path FROM public.characters c WHERE c.id = p_entity_id FOR UPDATE;
  ELSE
    SELECT n.image_url INTO previous_path FROM app_private.npcs n WHERE n.id = p_entity_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or unauthorized portrait' USING ERRCODE = '42501';
  END IF;
  -- Check the session and ownership again after any wait for the entity lock.
  PERFORM * FROM public.portrait_reference(p_session_token, p_entity_type, p_entity_id, true);
  IF previous_path IS DISTINCT FROM p_expected_path THEN
    RAISE EXCEPTION 'Portrait reference changed' USING ERRCODE = '40001';
  END IF;
  IF p_entity_type = 'character' THEN
    UPDATE public.characters SET portrait_path = p_new_path WHERE id = p_entity_id;
  ELSE
    UPDATE app_private.npcs SET image_url = p_new_path WHERE id = p_entity_id;
  END IF;
  RETURN QUERY SELECT previous_path, p_new_path;
END;
$$;

REVOKE ALL ON FUNCTION public.portrait_reference(text, text, uuid, boolean, text),
  public.portrait_change_reference(text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portrait_reference(text, text, uuid, boolean, text),
  public.portrait_change_reference(text, text, uuid, text, text) TO service_role;

-- Keep the existing call signature, but reject every non-NULL image argument.
CREATE OR REPLACE FUNCTION public.leader_create_npc(p_session_token text, p_name text, p_image_url text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Name required' USING ERRCODE = '22023';
  END IF;
  IF p_image_url IS NOT NULL THEN
    RAISE EXCEPTION 'NPC must be created without an image' USING ERRCODE = '22023';
  END IF;
  INSERT INTO app_private.npcs(name, image_url) VALUES (btrim(p_name), NULL) RETURNING id INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.leader_create_npc(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leader_create_npc(text, text, text) TO anon;

-- The existing character updater is replaced below, with only portrait writes removed.
CREATE OR REPLACE FUNCTION public.player_update_character(p_session_token text, p_character_id uuid, p_patch jsonb)
RETURNS TABLE (id uuid, user_id uuid, name text, portrait_path text, race_code text, class_code text,
  level integer, str integer, dex integer, con integer, int integer, wis integer, cha integer,
  xp integer, current_hp integer, max_hp integer, ac integer, ac_note text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account record; updated public.characters%ROWTYPE;
  allowed constant text[] := ARRAY['name','race_code','class_code','level','str','dex','con','int','wis','cha','xp','current_hp','max_hp','ac','ac_note'];
  key text;
BEGIN
  SELECT * INTO STRICT account FROM app_private.require_session(p_session_token, 'player');
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb
     OR (SELECT count(*) FROM jsonb_object_keys(p_patch)) <> 1 THEN
    RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_object_keys(p_patch) INTO key;
  IF NOT (key = ANY(allowed)) THEN RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501'; END IF;
  UPDATE public.characters c SET
    name = CASE WHEN key = 'name' THEN p_patch->>'name' ELSE c.name END,
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
      WHEN key = 'max_hp' AND c.current_hp IS NOT NULL AND (p_patch->>'max_hp')::integer < c.current_hp THEN (p_patch->>'max_hp')::integer ELSE c.current_hp END,
    ac = CASE WHEN key = 'ac' THEN (p_patch->>'ac')::integer ELSE c.ac END,
    ac_note = CASE WHEN key = 'ac_note' THEN NULLIF(p_patch->>'ac_note','') ELSE c.ac_note END,
    max_hp = CASE WHEN key = 'max_hp' THEN (p_patch->>'max_hp')::integer ELSE c.max_hp END
    WHERE c.id = p_character_id AND EXISTS (SELECT FROM app_private.user_characters uc
      WHERE uc.user_id = account.user_id AND uc.character_id = c.id)
    RETURNING c.* INTO updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT updated.id, updated.user_id, updated.name, updated.portrait_path, updated.race_code,
    updated.class_code, updated.level, updated.str, updated.dex, updated.con, updated.int, updated.wis,
    updated.cha, updated.xp, updated.current_hp, updated.max_hp, updated.ac, updated.ac_note;
END;
$$;


REVOKE ALL ON FUNCTION public.player_update_character(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_update_character(text, uuid, jsonb) TO anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
