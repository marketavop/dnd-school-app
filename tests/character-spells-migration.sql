-- Run against an EMPTY disposable PostgreSQL database as its owner:
-- psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/character-spells-migration.sql
\set ON_ERROR_STOP on

-- Reuse the immediately preceding schema fixture, including current RPCs with
-- subrace_code, features and skill proficiencies.
\ir character-subraces-migration.sql
\ir ../supabase/migrations/20261114120000_character_spells.sql

DO $$
DECLARE own_id constant uuid := '20000000-0000-0000-0000-000000000001';
  other_id constant uuid := '20000000-0000-0000-0000-000000000002';
  valid_spells constant jsonb := '[{"english_name":"Light","czech_name":"Světlo","level":0,"note":"Pro průzkum."},{"english_name":"Magic Missile","czech_name":"Magická střela","level":1,"note":""}]'::jsonb;
  row_data jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.characters WHERE spells <> '[]'::jsonb) THEN
    RAISE EXCEPTION 'Existing characters must receive an empty spell list';
  END IF;
  IF app_private.valid_spells('[]'::jsonb) IS NOT TRUE THEN
    RAISE EXCEPTION 'Empty spell list must be valid';
  END IF;
  IF app_private.valid_spells(valid_spells) IS NOT TRUE THEN
    RAISE EXCEPTION 'Valid spells were rejected';
  END IF;
  IF app_private.valid_spells('{"english_name":"Light"}'::jsonb) IS TRUE
     OR app_private.valid_spells('[{"english_name":"Light","czech_name":"Světlo","level":10,"note":""}]'::jsonb) IS TRUE
     OR app_private.valid_spells('[{"english_name":"Light","czech_name":"Světlo","level":1.5,"note":""}]'::jsonb) IS TRUE
     OR app_private.valid_spells('[null]'::jsonb) IS TRUE
     OR app_private.valid_spells('[1]'::jsonb) IS TRUE
     OR app_private.valid_spells('["Light"]'::jsonb) IS TRUE
     OR app_private.valid_spells('[true]'::jsonb) IS TRUE THEN
    RAISE EXCEPTION 'Invalid spell data was accepted by validation';
  END IF;

  BEGIN
    UPDATE public.characters SET spells = '[{"english_name":"Light","czech_name":"Světlo","level":10,"note":""}]'::jsonb WHERE id = own_id;
    RAISE EXCEPTION 'Direct invalid spell write accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  SELECT to_jsonb(r) INTO STRICT row_data
    FROM public.player_update_character('owner', own_id, jsonb_build_object('spells', valid_spells)) r;
  IF row_data->'spells' <> valid_spells THEN
    RAISE EXCEPTION 'Owned spell list was not saved';
  END IF;
  IF row_data->>'story_background' <> 'Původní příběh'
     OR row_data->'features' <> '[{"name":"Rys","note":"Pozorný."}]'::jsonb
     OR row_data->'skill_proficiencies' <> '{"perception":true}'::jsonb
     OR row_data->>'subrace_code' IS NOT NULL THEN
    RAISE EXCEPTION 'Spell update changed existing character fields';
  END IF;
  SELECT to_jsonb(r) INTO STRICT row_data FROM public.player_character('owner', own_id) r;
  IF row_data->'spells' <> valid_spells THEN RAISE EXCEPTION 'Player read returned wrong spells'; END IF;
  SELECT to_jsonb(r) INTO STRICT row_data FROM public.leader_character('leader', own_id) r;
  IF row_data->'spells' <> valid_spells THEN RAISE EXCEPTION 'Leader read returned wrong spells'; END IF;

  BEGIN
    PERFORM * FROM public.player_update_character('owner', own_id, '{"spells":[{"english_name":"Light","czech_name":"Světlo","level":10,"note":""}]}'::jsonb);
    RAISE EXCEPTION 'Invalid spell level accepted through RPC';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.player_update_character('owner', other_id, jsonb_build_object('spells', valid_spells));
    RAISE EXCEPTION 'Foreign spell update accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.player_update_character('leader', own_id, jsonb_build_object('spells', valid_spells));
    RAISE EXCEPTION 'Leader spell update accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

\echo 'character spells migration checks passed'
