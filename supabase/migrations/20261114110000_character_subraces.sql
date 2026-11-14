BEGIN;

-- D&D 5e (2014 PHB) subraces supported by this application.  NULL deliberately
-- means that the character has no chosen subrace.
CREATE FUNCTION app_private.valid_subrace_for_race(p_race_code text, p_subrace_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (VALUES
      ('dwarf'::text,    'hill_dwarf'::text),
      ('dwarf'::text,    'mountain_dwarf'::text),
      ('elf'::text,      'high_elf'::text),
      ('elf'::text,      'wood_elf'::text),
      ('elf'::text,      'drow'::text),
      ('halfling'::text, 'lightfoot_halfling'::text),
      ('halfling'::text, 'stout_halfling'::text),
      ('gnome'::text,    'forest_gnome'::text),
      ('gnome'::text,    'rock_gnome'::text)
    ) AS supported(race_code, subrace_code)
    WHERE supported.race_code = p_race_code
      AND supported.subrace_code = p_subrace_code
  );
$$;

ALTER TABLE public.characters
  ADD COLUMN subrace_code text NULL,
  ADD CONSTRAINT characters_subrace_matches_race
    CHECK (subrace_code IS NULL OR app_private.valid_subrace_for_race(race_code, subrace_code) IS TRUE);

-- The added result column changes each composite RPC result type. PostgreSQL
-- requires recreating exactly these overloads; their argument signatures and
-- grants are restored below. No other functions or privileges are removed.
DROP FUNCTION public.player_character(text, uuid);
DROP FUNCTION public.player_update_character(text, uuid, jsonb);
DROP FUNCTION public.leader_character(text, uuid);

CREATE OR REPLACE FUNCTION public.player_character(p_session_token text, p_character_id uuid)
RETURNS TABLE (id uuid, user_id uuid, name text, portrait_path text, race_code text, class_code text,
  level integer, str integer, dex integer, con integer, "int" integer, wis integer, cha integer,
  xp integer, current_hp integer, max_hp integer, ac integer, ac_note text, background text, story_background text, inventory text, notes text, features jsonb, skill_proficiencies jsonb, subrace_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account record;
BEGIN
  SELECT * INTO STRICT account FROM app_private.require_session(p_session_token, 'player');
  RETURN QUERY SELECT c.id, c.user_id, c.name, c.portrait_path, c.race_code, c.class_code,
    c.level, c.str, c.dex, c.con, c."int", c.wis, c.cha, c.xp, c.current_hp, c.max_hp, c.ac, c.ac_note, c.background, c.story_background, c.inventory, c.notes, c.features, c.skill_proficiencies, c.subrace_code
    FROM public.characters c JOIN app_private.user_characters uc
      ON uc.user_id = account.user_id AND uc.character_id = c.id
    WHERE c.id = p_character_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.player_update_character(p_session_token text, p_character_id uuid, p_patch jsonb)
RETURNS TABLE (id uuid, user_id uuid, name text, portrait_path text, race_code text, class_code text,
  level integer, str integer, dex integer, con integer, "int" integer, wis integer, cha integer,
  xp integer, current_hp integer, max_hp integer, ac integer, ac_note text, background text, story_background text, inventory text, notes text, features jsonb, skill_proficiencies jsonb, subrace_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account record; updated public.characters%ROWTYPE;
  allowed constant text[] := ARRAY['name','race_code','subrace_code','class_code','level','str','dex','con','int','wis','cha','xp','current_hp','max_hp','ac','ac_note','background','story_background','inventory','notes','features','skill_proficiencies'];
  key text; feature jsonb;
BEGIN
  SELECT * INTO STRICT account FROM app_private.require_session(p_session_token, 'player');
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' OR p_patch = '{}'::jsonb
     OR (SELECT count(*) FROM jsonb_object_keys(p_patch)) <> 1 THEN
    RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_object_keys(p_patch) INTO key;
  IF NOT (key = ANY(allowed)) THEN RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501'; END IF;
  IF key IN ('background', 'story_background', 'inventory', 'notes', 'subrace_code')
     AND jsonb_typeof(p_patch->key) NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'Character content must be a string or null' USING ERRCODE = '22023';
  END IF;
  IF key = 'skill_proficiencies'
     AND app_private.valid_skill_proficiencies(p_patch->key) IS NOT TRUE THEN
    RAISE EXCEPTION 'Skill proficiencies must use known skill codes and boolean values' USING ERRCODE = '22023';
  END IF;
  IF key = 'features' THEN
    IF jsonb_typeof(p_patch->key) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Features must be an array' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_patch->key) > 100 THEN
      RAISE EXCEPTION 'At most 100 features are allowed' USING ERRCODE = '22023';
    END IF;
    FOR feature IN SELECT value FROM jsonb_array_elements(p_patch->key) LOOP
      IF jsonb_typeof(feature) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Each feature must be an object' USING ERRCODE = '22023';
      END IF;
      IF jsonb_typeof(feature->'name') IS DISTINCT FROM 'string'
         OR jsonb_typeof(feature->'note') IS DISTINCT FROM 'string'
         OR (feature - 'name' - 'note') <> '{}'::jsonb THEN
        RAISE EXCEPTION 'Each feature requires only name and note strings' USING ERRCODE = '22023';
      END IF;
      IF (feature->>'name') !~ '[^[:space:]]'
         OR char_length(feature->>'name') > 100
         OR char_length(feature->>'note') > 2000 THEN
        RAISE EXCEPTION 'Feature name must be nonblank and at most 100 characters; note at most 2000' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
  UPDATE public.characters c SET
    features = CASE WHEN key = 'features' THEN p_patch->'features' ELSE c.features END,
    skill_proficiencies = CASE WHEN key = 'skill_proficiencies' THEN p_patch->'skill_proficiencies' ELSE c.skill_proficiencies END,
    story_background = CASE WHEN key = 'story_background' THEN NULLIF(p_patch->>'story_background','') ELSE c.story_background END,
    background = CASE WHEN key = 'background' THEN NULLIF(p_patch->>'background','') ELSE c.background END,
    inventory = CASE WHEN key = 'inventory' THEN NULLIF(p_patch->>'inventory','') ELSE c.inventory END,
    notes = CASE WHEN key = 'notes' THEN NULLIF(p_patch->>'notes','') ELSE c.notes END,
    name = CASE WHEN key = 'name' THEN p_patch->>'name' ELSE c.name END,
    race_code = CASE WHEN key = 'race_code' THEN NULLIF(p_patch->>'race_code','') ELSE c.race_code END,
    subrace_code = CASE
      WHEN key = 'subrace_code' THEN NULLIF(p_patch->>'subrace_code','')
      WHEN key = 'race_code' AND NULLIF(p_patch->>'race_code','') IS DISTINCT FROM c.race_code THEN NULL
      ELSE c.subrace_code
    END,
    class_code = CASE WHEN key = 'class_code' THEN NULLIF(p_patch->>'class_code','') ELSE c.class_code END,
    level = CASE WHEN key = 'level' THEN (p_patch->>'level')::integer ELSE c.level END,
    str = CASE WHEN key = 'str' THEN (p_patch->>'str')::integer ELSE c.str END,
    dex = CASE WHEN key = 'dex' THEN (p_patch->>'dex')::integer ELSE c.dex END,
    con = CASE WHEN key = 'con' THEN (p_patch->>'con')::integer ELSE c.con END,
    "int" = CASE WHEN key = 'int' THEN (p_patch->>'int')::integer ELSE c."int" END,
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
    updated.class_code, updated.level, updated.str, updated.dex, updated.con, updated."int", updated.wis,
    updated.cha, updated.xp, updated.current_hp, updated.max_hp, updated.ac, updated.ac_note, updated.background, updated.story_background, updated.inventory, updated.notes, updated.features, updated.skill_proficiencies, updated.subrace_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.leader_character(p_session_token text, p_character_id uuid)
RETURNS TABLE (id uuid, name text, portrait_path text, race_code text, class_code text, level integer,
  str integer, dex integer, con integer, "int" integer, wis integer, cha integer, xp integer, current_hp integer, max_hp integer, ac integer, ac_note text, background text, story_background text, inventory text, notes text, features jsonb, skill_proficiencies jsonb, subrace_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  RETURN QUERY SELECT c.id, c.name, c.portrait_path, c.race_code, c.class_code, c.level, c.str, c.dex,
    c.con, c."int", c.wis, c.cha, c.xp, c.current_hp, c.max_hp, c.ac, c.ac_note, c.background, c.story_background, c.inventory, c.notes, c.features, c.skill_proficiencies, c.subrace_code FROM public.characters c
    WHERE c.id = p_character_id AND EXISTS (SELECT FROM app_private.user_characters uc
      JOIN app_private.users u ON u.id = uc.user_id WHERE u.role = 'player' AND uc.character_id = c.id);
END;
$$;

REVOKE ALL ON FUNCTION app_private.valid_subrace_for_race(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.player_character(text, uuid), public.player_update_character(text, uuid, jsonb), public.leader_character(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.player_character(text, uuid),
  public.player_update_character(text, uuid, jsonb),
  public.leader_character(text, uuid)
TO anon, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
