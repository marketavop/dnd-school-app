BEGIN;

-- Only mutable slot state is stored here. The D&D 5e progression tables stay
-- in public/spell-slots.js, where the application derives all maxima.
CREATE FUNCTION app_private.valid_spell_slot_state(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN jsonb_typeof(p_value) = 'object'
    AND (((((p_value - 'current'::text) - 'maximum'::text) - 'manual_correction'::text) - 'source'::text) = '{}'::jsonb)
    AND jsonb_typeof(p_value->'current'::text) = 'object'
    AND jsonb_typeof(p_value->'maximum'::text) = 'object'
    AND jsonb_typeof(p_value->'manual_correction'::text) = 'object'
    AND jsonb_typeof(p_value->'source'::text) IN ('object', 'null')
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(p_value->'current'::text) AS entry(slot_level, amount)
      WHERE slot_level !~ '^[1-9]$'
        OR jsonb_typeof(amount) <> 'number'
        OR amount #>> '{}'::text[] !~ '^(0|[1-9][0-9]{0,8})$'
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(p_value->'maximum'::text) AS entry(slot_level, amount)
      WHERE slot_level !~ '^[1-9]$'
        OR jsonb_typeof(amount) <> 'number'
        OR amount #>> '{}'::text[] !~ '^(0|[1-9][0-9]{0,8})$'
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_value->'current'::text) AS key(slot_level)
      WHERE NOT ((p_value->'maximum'::text) ? slot_level::text)
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_value->'maximum'::text) AS key(slot_level)
      WHERE NOT ((p_value->'current'::text) ? slot_level::text)
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(p_value->'current'::text) AS entry(slot_level, current_amount)
      WHERE NOT (CASE
        WHEN jsonb_typeof(current_amount) = 'number' AND jsonb_typeof((p_value->'maximum'::text)->slot_level::text) = 'number'
        THEN (current_amount #>> '{}'::text[])::integer <= ((p_value->'maximum'::text)->slot_level::text #>> '{}'::text[])::integer
        ELSE false
      END)
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_each(p_value->'manual_correction'::text) AS entry(slot_level, adjustment)
      WHERE slot_level !~ '^[1-9]$'
        OR jsonb_typeof(adjustment) <> 'number'
        OR adjustment #>> '{}'::text[] !~ '^-?(0|[1-9][0-9]{0,8})$'
    )
    AND (CASE
      WHEN (p_value->'source'::text) = 'null'::jsonb THEN true
      WHEN jsonb_typeof(p_value->'source'::text) = 'object' THEN (
        (((p_value->'source'::text) - ARRAY['class_code', 'level']::text[]) = '{}'::jsonb)
        AND jsonb_typeof((p_value->'source'::text)->'class_code'::text) = 'string'
        AND jsonb_typeof((p_value->'source'::text)->'level'::text) = 'number'
        AND (p_value->'source'::text)->>'class_code'::text IN ('barbarian','bard','cleric','druid','fighter','monk','paladin','ranger','rogue','sorcerer','warlock','wizard')
        AND (p_value->'source'::text)->>'level'::text ~ '^(?:[1-9]|1[0-9]|20)$'
      )
      ELSE false END)
  THEN true ELSE false END;
$$;

ALTER TABLE public.characters
  ADD COLUMN spell_slot_state jsonb NOT NULL DEFAULT '{"current":{},"maximum":{},"manual_correction":{},"source":null}'::jsonb,
  ADD CONSTRAINT characters_spell_slot_state_valid CHECK (app_private.valid_spell_slot_state(spell_slot_state) IS TRUE);

-- The result composite types gain spell_slot_state, so PostgreSQL requires
-- recreating the exact RPC overloads. Existing ownership and grants remain.
DROP FUNCTION public.player_character(text, uuid);
DROP FUNCTION public.player_update_character(text, uuid, jsonb);
DROP FUNCTION public.leader_character(text, uuid);

CREATE OR REPLACE FUNCTION public.player_character(p_session_token text, p_character_id uuid)
RETURNS TABLE (id uuid, user_id uuid, name text, portrait_path text, race_code text, class_code text,
  level integer, str integer, dex integer, con integer, "int" integer, wis integer, cha integer,
  xp integer, current_hp integer, max_hp integer, ac integer, ac_note text, background text, story_background text, inventory text, notes text, features jsonb, skill_proficiencies jsonb, subrace_code text, spells jsonb, spell_slot_state jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account record;
BEGIN
  SELECT * INTO STRICT account FROM app_private.require_session(p_session_token, 'player');
  RETURN QUERY SELECT c.id, c.user_id, c.name, c.portrait_path, c.race_code, c.class_code,
    c.level, c.str, c.dex, c.con, c."int", c.wis, c.cha, c.xp, c.current_hp, c.max_hp, c.ac, c.ac_note, c.background, c.story_background, c.inventory, c.notes, c.features, c.skill_proficiencies, c.subrace_code, c.spells, c.spell_slot_state
    FROM public.characters c JOIN app_private.user_characters uc
      ON uc.user_id = account.user_id AND uc.character_id = c.id
    WHERE c.id = p_character_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.player_update_character(p_session_token text, p_character_id uuid, p_patch jsonb)
RETURNS TABLE (id uuid, user_id uuid, name text, portrait_path text, race_code text, class_code text,
  level integer, str integer, dex integer, con integer, "int" integer, wis integer, cha integer,
  xp integer, current_hp integer, max_hp integer, ac integer, ac_note text, background text, story_background text, inventory text, notes text, features jsonb, skill_proficiencies jsonb, subrace_code text, spells jsonb, spell_slot_state jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account record; updated public.characters%ROWTYPE;
  allowed constant text[] := ARRAY['name','race_code','subrace_code','class_code','level','str','dex','con','int','wis','cha','xp','current_hp','max_hp','ac','ac_note','background','story_background','inventory','notes','features','skill_proficiencies','spells','spell_slot_state'];
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
  IF key = 'spells' AND app_private.valid_spells(p_patch->key) IS NOT TRUE THEN
    RAISE EXCEPTION 'Spells must be a valid list of named spells from level 0 to 9' USING ERRCODE = '22023';
  END IF;
  IF key = 'spell_slot_state' THEN
    IF app_private.valid_spell_slot_state(p_patch->key) IS NOT TRUE THEN
      RAISE EXCEPTION 'Spell slot state is invalid' USING ERRCODE = '22023';
    END IF;
    SELECT c.* INTO updated
    FROM public.characters c
    WHERE c.id = p_character_id
      AND EXISTS (SELECT 1 FROM app_private.user_characters uc
                  WHERE uc.user_id = account.user_id AND uc.character_id = c.id)
    FOR UPDATE OF c;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501';
    END IF;
    IF ((p_patch->'spell_slot_state')->'source') <> 'null'::jsonb
       AND ((p_patch->'spell_slot_state'->'source'->>'class_code') IS DISTINCT FROM updated.class_code
         OR (p_patch->'spell_slot_state'->'source'->>'level')::integer IS DISTINCT FROM updated.level) THEN
      RAISE EXCEPTION 'Spell slot state source must match character class and level' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF key = 'skill_proficiencies'
     AND app_private.valid_skill_proficiencies(p_patch->key) IS NOT TRUE THEN
    RAISE EXCEPTION 'Skill proficiencies must use known skill codes and boolean values' USING ERRCODE = '22023';
  END IF;
  IF key = 'features' THEN
    IF jsonb_typeof(p_patch->key) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Features must be an array' USING ERRCODE = '22023'; END IF;
    IF jsonb_array_length(p_patch->key) > 100 THEN RAISE EXCEPTION 'At most 100 features are allowed' USING ERRCODE = '22023'; END IF;
    FOR feature IN SELECT value FROM jsonb_array_elements(p_patch->key) LOOP
      IF jsonb_typeof(feature) IS DISTINCT FROM 'object'
         OR jsonb_typeof(feature->'name'::text) IS DISTINCT FROM 'string'
         OR jsonb_typeof(feature->'note'::text) IS DISTINCT FROM 'string'
         OR ((feature - 'name'::text) - 'note'::text) <> '{}'::jsonb
         OR (feature->>'name') !~ '[^[:space:]]'
         OR char_length(feature->>'name') > 100
         OR char_length(feature->>'note') > 2000 THEN
        RAISE EXCEPTION 'Each feature requires a valid name and note' USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;
  UPDATE public.characters c SET
    features = CASE WHEN key = 'features' THEN p_patch->'features' ELSE c.features END,
    skill_proficiencies = CASE WHEN key = 'skill_proficiencies' THEN p_patch->'skill_proficiencies' ELSE c.skill_proficiencies END,
    spells = CASE WHEN key = 'spells' THEN p_patch->'spells' ELSE c.spells END,
    spell_slot_state = CASE
      WHEN key = 'spell_slot_state' THEN p_patch->'spell_slot_state'
      WHEN key IN ('class_code', 'level') THEN jsonb_set(c.spell_slot_state, '{manual_correction}'::text[], '{}'::jsonb)
      ELSE c.spell_slot_state END,
    story_background = CASE WHEN key = 'story_background' THEN NULLIF(p_patch->>'story_background','') ELSE c.story_background END,
    background = CASE WHEN key = 'background' THEN NULLIF(p_patch->>'background','') ELSE c.background END,
    inventory = CASE WHEN key = 'inventory' THEN NULLIF(p_patch->>'inventory','') ELSE c.inventory END,
    notes = CASE WHEN key = 'notes' THEN NULLIF(p_patch->>'notes','') ELSE c.notes END,
    name = CASE WHEN key = 'name' THEN p_patch->>'name' ELSE c.name END,
    race_code = CASE WHEN key = 'race_code' THEN NULLIF(p_patch->>'race_code','') ELSE c.race_code END,
    subrace_code = CASE WHEN key = 'subrace_code' THEN NULLIF(p_patch->>'subrace_code','') WHEN key = 'race_code' AND NULLIF(p_patch->>'race_code','') IS DISTINCT FROM c.race_code THEN NULL ELSE c.subrace_code END,
    class_code = CASE WHEN key = 'class_code' THEN NULLIF(p_patch->>'class_code','') ELSE c.class_code END,
    level = CASE WHEN key = 'level' THEN (p_patch->>'level')::integer ELSE c.level END,
    str = CASE WHEN key = 'str' THEN (p_patch->>'str')::integer ELSE c.str END,
    dex = CASE WHEN key = 'dex' THEN (p_patch->>'dex')::integer ELSE c.dex END,
    con = CASE WHEN key = 'con' THEN (p_patch->>'con')::integer ELSE c.con END,
    "int" = CASE WHEN key = 'int' THEN (p_patch->>'int')::integer ELSE c."int" END,
    wis = CASE WHEN key = 'wis' THEN (p_patch->>'wis')::integer ELSE c.wis END,
    cha = CASE WHEN key = 'cha' THEN (p_patch->>'cha')::integer ELSE c.cha END,
    xp = CASE WHEN key = 'xp' THEN (p_patch->>'xp')::integer ELSE c.xp END,
    current_hp = CASE WHEN key = 'current_hp' THEN (p_patch->>'current_hp')::integer WHEN key = 'max_hp' AND c.current_hp IS NOT NULL AND (p_patch->>'max_hp')::integer < c.current_hp THEN (p_patch->>'max_hp')::integer ELSE c.current_hp END,
    ac = CASE WHEN key = 'ac' THEN (p_patch->>'ac')::integer ELSE c.ac END,
    ac_note = CASE WHEN key = 'ac_note' THEN NULLIF(p_patch->>'ac_note','') ELSE c.ac_note END,
    max_hp = CASE WHEN key = 'max_hp' THEN (p_patch->>'max_hp')::integer ELSE c.max_hp END
    WHERE c.id = p_character_id AND EXISTS (SELECT FROM app_private.user_characters uc WHERE uc.user_id = account.user_id AND uc.character_id = c.id)
    RETURNING c.* INTO updated;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT updated.id, updated.user_id, updated.name, updated.portrait_path, updated.race_code, updated.class_code, updated.level, updated.str, updated.dex, updated.con, updated."int", updated.wis, updated.cha, updated.xp, updated.current_hp, updated.max_hp, updated.ac, updated.ac_note, updated.background, updated.story_background, updated.inventory, updated.notes, updated.features, updated.skill_proficiencies, updated.subrace_code, updated.spells, updated.spell_slot_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.leader_character(p_session_token text, p_character_id uuid)
RETURNS TABLE (id uuid, name text, portrait_path text, race_code text, class_code text, level integer,
  str integer, dex integer, con integer, "int" integer, wis integer, cha integer, xp integer, current_hp integer, max_hp integer, ac integer, ac_note text, background text, story_background text, inventory text, notes text, features jsonb, skill_proficiencies jsonb, subrace_code text, spells jsonb, spell_slot_state jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  RETURN QUERY SELECT c.id, c.name, c.portrait_path, c.race_code, c.class_code, c.level, c.str, c.dex, c.con, c."int", c.wis, c.cha, c.xp, c.current_hp, c.max_hp, c.ac, c.ac_note, c.background, c.story_background, c.inventory, c.notes, c.features, c.skill_proficiencies, c.subrace_code, c.spells, c.spell_slot_state FROM public.characters c
    WHERE c.id = p_character_id AND EXISTS (SELECT FROM app_private.user_characters uc JOIN app_private.users u ON u.id = uc.user_id WHERE u.role = 'player' AND uc.character_id = c.id);
END;
$$;

REVOKE ALL ON FUNCTION
    app_private.valid_spell_slot_state(jsonb)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
    public.player_character(text, uuid),
    public.player_update_character(text, uuid, jsonb),
    public.leader_character(text, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.player_character(text, uuid),
    public.player_update_character(text, uuid, jsonb),
    public.leader_character(text, uuid)
TO anon, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;