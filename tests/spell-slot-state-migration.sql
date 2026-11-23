-- Run against an EMPTY disposable PostgreSQL database as its owner:
-- psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/spell-slot-state-migration.sql
\set ON_ERROR_STOP on

\ir character-spells-migration.sql
\ir ../supabase/migrations/20261117100000_spell_slot_state.sql

INSERT INTO public.characters(id, name, class_code, level)
VALUES ('20000000-0000-0000-0000-000000000003', 'Druhá vlastní', 'wizard', 1);
INSERT INTO app_private.user_characters(user_id, character_id)
VALUES ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.characters WHERE spell_slot_state <> '{"current":{},"maximum":{},"manual_correction":{},"source":null}'::jsonb) THEN
    RAISE EXCEPTION 'Existing characters must receive the empty spell-slot state';
  END IF;
  IF app_private.valid_spell_slot_state('{"current":{"1":1},"maximum":{"1":4},"manual_correction":{"1":2},"source":{"class_code":"wizard","level":1}}') IS NOT TRUE THEN
    RAISE EXCEPTION 'Valid spell-slot state was rejected';
  END IF;
  IF app_private.valid_spell_slot_state('{"current":{"0":1},"maximum":{"0":1},"manual_correction":{},"source":null}') IS TRUE
     OR app_private.valid_spell_slot_state('{"current":{"1":2},"maximum":{"1":1},"manual_correction":{},"source":null}') IS TRUE
     OR app_private.valid_spell_slot_state('{"current":{},"maximum":{},"manual_correction":{"1":1.5},"source":null}') IS TRUE
     OR app_private.valid_spell_slot_state('{"current":{},"maximum":{},"manual_correction":{},"source":{"class_code":"wizard","level":"1"}}') IS TRUE
     OR app_private.valid_spell_slot_state('{"current":{},"maximum":{},"manual_correction":{},"source":{"class_code":"invalid","level":1}}') IS TRUE THEN
    RAISE EXCEPTION 'Invalid spell-slot state was accepted';
  END IF;
END;
$$;

BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE own_id constant uuid := '20000000-0000-0000-0000-000000000001';
  second_id constant uuid := '20000000-0000-0000-0000-000000000003';
  foreign_id constant uuid := '20000000-0000-0000-0000-000000000002';
  state_l1 constant jsonb := '{"current":{"1":3},"maximum":{"1":4},"manual_correction":{"1":2},"source":{"class_code":"wizard","level":1}}';
  state_pact constant jsonb := '{"current":{"2":1},"maximum":{"2":2},"manual_correction":{},"source":{"class_code":"warlock","level":3}}';
  row_data jsonb;
BEGIN
  -- Existing records load with a valid empty state; set the existing class and
  -- level through the same player RPC used by the app.
  PERFORM * FROM public.player_update_character('owner', own_id, '{"class_code":"wizard"}');
  PERFORM * FROM public.player_update_character('owner', own_id, '{"level":1}');
  SELECT to_jsonb(r) INTO STRICT row_data FROM public.player_update_character('owner', own_id, jsonb_build_object('spell_slot_state', state_l1)) r;
  IF row_data->'spell_slot_state'::text <> state_l1 THEN RAISE EXCEPTION 'Owned slot state was not saved'; END IF;
  SELECT to_jsonb(r) INTO STRICT row_data FROM public.player_character('owner', own_id) r;
  IF row_data->'spell_slot_state'::text <> state_l1 THEN RAISE EXCEPTION 'Player read did not retain slot state'; END IF;
  SELECT to_jsonb(r) INTO STRICT row_data FROM public.leader_character('leader', own_id) r;
  IF row_data->'spell_slot_state'::text <> state_l1 THEN RAISE EXCEPTION 'Leader read did not retain slot state'; END IF;

  -- The saved source/current retain the information SLOT-01 needs to preserve
  -- one spent slot; manual corrections are reset atomically by level change.
  SELECT to_jsonb(r) INTO STRICT row_data FROM public.player_update_character('owner', own_id, '{"level":3}') r;
  IF row_data->'spell_slot_state'::text <> '{"current":{"1":3},"maximum":{"1":4},"manual_correction":{},"source":{"class_code":"wizard","level":1}}'::jsonb THEN
    RAISE EXCEPTION 'Level change did not clear correction while retaining slot consumption';
  END IF;

  PERFORM * FROM public.player_update_character('owner', own_id, '{"class_code":"warlock"}');
  PERFORM * FROM public.player_update_character('owner', own_id, '{"level":3}');
  PERFORM * FROM public.player_update_character('owner', own_id, jsonb_build_object('spell_slot_state', state_pact));
  SELECT to_jsonb(r) INTO STRICT row_data FROM public.player_update_character('owner', own_id, '{"level":5}') r;
  IF row_data->'spell_slot_state'::text <> state_pact THEN RAISE EXCEPTION 'Pact Magic consumption was not retained across level change'; END IF;

  -- Independent row and ownership boundary.
  SELECT to_jsonb(r) INTO STRICT row_data FROM public.player_character('owner', second_id) r;
  IF row_data->'spell_slot_state'::text <> '{"current":{},"maximum":{},"manual_correction":{},"source":null}'::jsonb THEN RAISE EXCEPTION 'Second character state leaked'; END IF;
  BEGIN PERFORM * FROM public.player_update_character('owner', foreign_id, jsonb_build_object('spell_slot_state', state_l1)); RAISE EXCEPTION 'Foreign write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.player_update_character('leader', own_id, jsonb_build_object('spell_slot_state', state_l1)); RAISE EXCEPTION 'Leader write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.player_update_character('owner', own_id, '{"spell_slot_state":{"current":{"1":100},"maximum":{"1":99},"manual_correction":{},"source":null}}'); RAISE EXCEPTION 'Invalid slot count accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM * FROM public.player_update_character('owner', own_id, '{"spell_slot_state":{"current":{},"maximum":{},"manual_correction":{},"source":{"class_code":"wizard","level":1}}}'); RAISE EXCEPTION 'Mismatched state source accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END;
$$;
RESET ROLE;
ROLLBACK;
\echo 'PASS: spell-slot state migration contract (rolled back)'
