-- Run against an EMPTY disposable PostgreSQL database as its owner:
-- psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/character-subraces-migration.sql
-- The fixture models the schema immediately before the subrace migration.
\set ON_ERROR_STOP on

CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA app_private;

CREATE TABLE public.characters (
  id uuid PRIMARY KEY, user_id uuid, name text NOT NULL, portrait_path text,
  race_code text, class_code text, level integer, str integer, dex integer,
  con integer, "int" integer, wis integer, cha integer, xp integer,
  current_hp integer, max_hp integer, ac integer, ac_note text, background text,
  story_background text, inventory text, notes text, features jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE app_private.user_characters (user_id uuid NOT NULL, character_id uuid NOT NULL);
CREATE TABLE app_private.users (id uuid PRIMARY KEY, role text NOT NULL);

-- A deterministic session fixture is enough to exercise the SECURITY DEFINER
-- RPC boundary; authentication itself is covered by its own migration tests.
CREATE FUNCTION app_private.require_session(p_session_token text, p_required_role text DEFAULT NULL)
RETURNS TABLE (user_id uuid, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_session_token = 'owner' AND p_required_role = 'player' THEN
    RETURN QUERY SELECT '10000000-0000-0000-0000-000000000001'::uuid, 'player'::text;
  ELSIF p_session_token = 'other' AND p_required_role = 'player' THEN
    RETURN QUERY SELECT '10000000-0000-0000-0000-000000000002'::uuid, 'player'::text;
  ELSIF p_session_token = 'leader' AND p_required_role = 'leader' THEN
    RETURN QUERY SELECT '10000000-0000-0000-0000-000000000003'::uuid, 'leader'::text;
  END IF;
  RAISE EXCEPTION 'Invalid or unauthorized session' USING ERRCODE = '42501';
END;
$$;

-- The preceding migration drops these exact overloads before replacing them.
CREATE FUNCTION public.player_character(text, uuid)
RETURNS TABLE (id uuid, user_id uuid, name text, portrait_path text, race_code text, class_code text,
  level integer, str integer, dex integer, con integer, "int" integer, wis integer, cha integer,
  xp integer, current_hp integer, max_hp integer, ac integer, ac_note text, background text, story_background text, inventory text, notes text, features jsonb)
LANGUAGE plpgsql AS $$ BEGIN RETURN; END; $$;
CREATE FUNCTION public.player_update_character(text, uuid, jsonb)
RETURNS TABLE (id uuid, user_id uuid, name text, portrait_path text, race_code text, class_code text,
  level integer, str integer, dex integer, con integer, "int" integer, wis integer, cha integer,
  xp integer, current_hp integer, max_hp integer, ac integer, ac_note text, background text, story_background text, inventory text, notes text, features jsonb)
LANGUAGE plpgsql AS $$ BEGIN RETURN; END; $$;
CREATE FUNCTION public.leader_character(text, uuid)
RETURNS TABLE (id uuid, name text, portrait_path text, race_code text, class_code text, level integer,
  str integer, dex integer, con integer, "int" integer, wis integer, cha integer, xp integer, current_hp integer, max_hp integer, ac integer, ac_note text, background text, story_background text, inventory text, notes text, features jsonb)
LANGUAGE plpgsql AS $$ BEGIN RETURN; END; $$;

\ir ../supabase/migrations/20261113120000_character_skill_proficiencies.sql
\ir ../supabase/migrations/20261114110000_character_subraces.sql

INSERT INTO public.characters (id, name, race_code, story_background, features, skill_proficiencies)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'Vlastní', 'elf', 'Původní příběh', '[{"name":"Rys","note":"Pozorný."}]', '{"perception":true}'),
  ('20000000-0000-0000-0000-000000000002', 'Cizí', 'dwarf', NULL, '[]', '{}');
INSERT INTO app_private.user_characters VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002');
INSERT INTO app_private.users VALUES
  ('10000000-0000-0000-0000-000000000001', 'player'),
  ('10000000-0000-0000-0000-000000000002', 'player'),
  ('10000000-0000-0000-0000-000000000003', 'leader');

-- All supported pairs work, and existing rows begin with NULL.
DO $$
DECLARE item record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.characters WHERE subrace_code IS NOT NULL) THEN
    RAISE EXCEPTION 'Existing characters must receive NULL subrace_code';
  END IF;
  FOR item IN SELECT * FROM (VALUES
    ('dwarf'::text, 'hill_dwarf'::text), ('dwarf', 'mountain_dwarf'),
    ('elf', 'high_elf'), ('elf', 'wood_elf'), ('elf', 'drow'),
    ('halfling', 'lightfoot_halfling'), ('halfling', 'stout_halfling'),
    ('gnome', 'forest_gnome'), ('gnome', 'rock_gnome')
  ) AS supported(race_code, subrace_code) LOOP
    UPDATE public.characters SET race_code = item.race_code, subrace_code = item.subrace_code
      WHERE id = '20000000-0000-0000-0000-000000000001';
  END LOOP;
  -- NULL remains valid for legacy characters and for an unchosen subrace.
  UPDATE public.characters SET race_code = NULL, subrace_code = NULL
    WHERE id = '20000000-0000-0000-0000-000000000001';
  BEGIN
    UPDATE public.characters SET race_code = NULL, subrace_code = 'high_elf'
      WHERE id = '20000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'Subrace without race accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.characters SET race_code = 'elf', subrace_code = 'hill_dwarf'
      WHERE id = '20000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'Invalid race/subrace pair accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.characters SET race_code = 'elf', subrace_code = NULL
    WHERE id = '20000000-0000-0000-0000-000000000001';
END;
$$;

BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE own_id constant uuid := '20000000-0000-0000-0000-000000000001';
  other_id constant uuid := '20000000-0000-0000-0000-000000000002';
  row_data jsonb;
BEGIN
  SELECT to_jsonb(r) INTO STRICT row_data FROM public.player_update_character('owner', own_id, '{"subrace_code":"high_elf"}') r;
  IF row_data->>'subrace_code' <> 'high_elf' THEN RAISE EXCEPTION 'Valid owned subrace was not saved'; END IF;
  IF row_data->>'story_background' <> 'Původní příběh'
     OR row_data->'features' <> '[{"name":"Rys","note":"Pozorný."}]'::jsonb
     OR row_data->'skill_proficiencies' <> '{"perception":true}'::jsonb THEN
    RAISE EXCEPTION 'Subrace update changed existing character fields';
  END IF;

  -- The same race retains the subrace; an actual race change clears it atomically.
  SELECT to_jsonb(r) INTO STRICT row_data FROM public.player_update_character('owner', own_id, '{"race_code":"elf"}') r;
  IF row_data->>'subrace_code' <> 'high_elf' THEN RAISE EXCEPTION 'Same race incorrectly cleared subrace'; END IF;
  SELECT to_jsonb(r) INTO STRICT row_data FROM public.player_update_character('owner', own_id, '{"race_code":"dwarf"}') r;
  IF row_data->>'subrace_code' IS NOT NULL OR row_data->>'story_background' <> 'Původní příběh' THEN
    RAISE EXCEPTION 'Race change did not clear only subrace';
  END IF;
  PERFORM * FROM public.player_update_character('owner', own_id, '{"race_code":"elf"}');

  BEGIN
    PERFORM * FROM public.player_update_character('owner', own_id, '{"subrace_code":"mountain_dwarf"}');
    RAISE EXCEPTION 'Invalid race/subrace pair accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.player_update_character('owner', other_id, '{"subrace_code":"hill_dwarf"}');
    RAISE EXCEPTION 'Foreign subrace update accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.characters SET subrace_code = 'high_elf' WHERE id = own_id;
    RAISE EXCEPTION 'Direct table update accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT to_jsonb(r) INTO STRICT row_data FROM public.leader_character('leader', own_id) r;
  IF row_data->>'subrace_code' IS NOT NULL THEN RAISE EXCEPTION 'Leader read returned wrong subrace'; END IF;
  BEGIN
    PERFORM * FROM public.player_update_character('leader', own_id, '{"subrace_code":"high_elf"}');
    RAISE EXCEPTION 'Leader subrace update accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;
ROLLBACK;
\echo 'character subrace migration checks passed (data transaction rolled back)'
