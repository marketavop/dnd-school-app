-- Run in an empty disposable PostgreSQL database with CREATE ROLE/EXTENSION privileges:
-- psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/leader-inventory-items-migration.sql
\set ON_ERROR_STOP on

-- Run the player RPC regressions and preserve their resulting schema and grants.
\ir player-inventory-item-mutations-migration.sql
CREATE TEMP TABLE player_inventory_grants_before AS
SELECT oid, proacl FROM pg_proc WHERE oid IN (
  'public.player_inventory_items(text, uuid)'::regprocedure,
  'public.player_add_inventory_item(text, uuid, text, text, numeric, numeric, boolean, text)'::regprocedure,
  'public.player_update_inventory_item(text, uuid, uuid, jsonb)'::regprocedure,
  'public.player_delete_inventory_item(text, uuid, uuid)'::regprocedure
);

\ir ../supabase/migrations/20261124120000_leader_inventory_items.sql

BEGIN;
INSERT INTO public.characters (id, name) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Character A'),
  ('20000000-0000-0000-0000-000000000002', 'Character B'),
  ('20000000-0000-0000-0000-000000000003', 'Empty inventory'),
  ('20000000-0000-0000-0000-000000000004', 'Character without a player owner');

INSERT INTO app_private.users (id, username, password_hash, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'player-a', '$2a$12$......................JJuKLOX9OOwo5PceZZXSkaLDvdmgb82', 'player'),
  ('10000000-0000-0000-0000-000000000002', 'player-b', '$2a$12$......................JJuKLOX9OOwo5PceZZXSkaLDvdmgb82', 'player'),
  ('10000000-0000-0000-0000-000000000003', 'leader', '$2a$12$......................JJuKLOX9OOwo5PceZZXSkaLDvdmgb82', 'leader');
INSERT INTO app_private.user_characters (user_id, character_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004');

INSERT INTO app_private.sessions (token_hash, user_id, role, created_at, expires_at)
SELECT extensions.digest(repeat(fixture.token_char, 64), 'sha256'), u.id, u.role,
  clock_timestamp() - interval '2 hours', clock_timestamp() + fixture.expiry
FROM (VALUES
  ('player-a', 'a', interval '1 hour'),
  ('player-b', 'b', interval '1 hour'),
  ('leader', 'c', interval '1 hour'),
  ('leader', 'e', interval '-1 hour')
) AS fixture(username, token_char, expiry)
JOIN app_private.users u USING (username);

INSERT INTO app_private.character_inventory_items
  (character_id, name, item_type, quantity, price_gp, not_for_sale, note)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'Rope', 'adventuring_gear', 2, NULL, false, NULL),
  ('20000000-0000-0000-0000-000000000001', 'Key', 'quest_item', 1, 1.25, true, 'Keep'),
  ('20000000-0000-0000-0000-000000000002', 'Shield', 'armor_shield', 1, 0, false, NULL),
  ('20000000-0000-0000-0000-000000000004', 'Private item', 'other', 1, NULL, false, NULL);
CREATE TEMP TABLE inventory_before AS TABLE app_private.character_inventory_items;

SET LOCAL ROLE anon;
DO $$
DECLARE
  character_a constant uuid := '20000000-0000-0000-0000-000000000001';
  leader_token constant text := repeat('c', 64);
  denied_token text;
  scenario record;
  leader_items jsonb;
  player_items jsonb;
  item_id uuid;
BEGIN
  FOR scenario IN SELECT * FROM (VALUES
    (character_a, repeat('a', 64), 2),
    ('20000000-0000-0000-0000-000000000002'::uuid, repeat('b', 64), 1)
  ) AS cases(character_id, player_token, item_count) LOOP
    SELECT jsonb_agg(i ORDER BY i.id) INTO leader_items
    FROM public.leader_inventory_items(leader_token, scenario.character_id) i;
    SELECT jsonb_agg(i ORDER BY i.id) INTO player_items
    FROM public.player_inventory_items(scenario.player_token, scenario.character_id) i;
    IF jsonb_array_length(leader_items) IS DISTINCT FROM scenario.item_count
       OR leader_items IS DISTINCT FROM player_items THEN
      RAISE EXCEPTION 'Leader inventory did not match the player result for %', scenario.character_id;
    END IF;
  END LOOP;

  IF EXISTS (SELECT FROM public.leader_inventory_items(leader_token, '20000000-0000-0000-0000-000000000003'))
     OR EXISTS (SELECT FROM public.leader_inventory_items(leader_token, '20000000-0000-0000-0000-000000000004'))
     OR EXISTS (SELECT FROM public.leader_inventory_items(leader_token, '20000000-0000-0000-0000-000000000099')) THEN
    RAISE EXCEPTION 'Expected no rows for an empty, non-player or unknown character';
  END IF;

  FOREACH denied_token IN ARRAY ARRAY[NULL, '', 'invalid', repeat('0', 64), repeat('e', 64), repeat('a', 64)] LOOP
    BEGIN
      PERFORM FROM public.leader_inventory_items(denied_token, character_a);
      RAISE EXCEPTION 'Leader read accepted a non-leader or invalid session';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;

  SELECT i.id INTO item_id FROM public.leader_inventory_items(leader_token, character_a) i LIMIT 1;
  BEGIN
    PERFORM FROM public.player_add_inventory_item(leader_token, character_a, 'Denied', 'other');
    RAISE EXCEPTION 'Leader could insert an item';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM FROM public.player_update_inventory_item(leader_token, character_a, item_id, '{"name":"Denied"}');
    RAISE EXCEPTION 'Leader could update an item';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.player_delete_inventory_item(leader_token, character_a, item_id);
    RAISE EXCEPTION 'Leader could delete an item';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM FROM app_private.character_inventory_items;
    RAISE EXCEPTION 'Direct client read was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

DO $$
DECLARE
  leader_rpc constant regprocedure := 'public.leader_inventory_items(text, uuid)'::regprocedure;
BEGIN
  IF NOT has_function_privilege('anon', leader_rpc, 'EXECUTE')
     OR has_function_privilege('authenticated', leader_rpc, 'EXECUTE')
     OR has_function_privilege('service_role', leader_rpc, 'EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected EXECUTE privileges on the leader inventory RPC';
  END IF;
  IF EXISTS (
    SELECT FROM player_inventory_grants_before b LEFT JOIN pg_proc p ON p.oid = b.oid
    WHERE p.oid IS NULL OR p.proacl IS DISTINCT FROM b.proacl
  ) THEN
    RAISE EXCEPTION 'Existing player inventory RPC grants changed';
  END IF;
  IF EXISTS (
    (TABLE app_private.character_inventory_items EXCEPT TABLE inventory_before)
    UNION ALL
    (TABLE inventory_before EXCEPT TABLE app_private.character_inventory_items)
  ) THEN
    RAISE EXCEPTION 'Leader operations changed inventory data';
  END IF;
END;
$$;

-- Simulate an empty verifier result after testing the real helper.
-- The rollback below restores its original definition.
CREATE OR REPLACE FUNCTION app_private.require_session(p_session_token text, p_required_role text DEFAULT NULL)
RETURNS TABLE (user_id uuid, role text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT NULL::uuid, NULL::text WHERE false;
$$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM FROM public.leader_inventory_items(repeat('c', 64), '20000000-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'Leader read accepted an empty verifier result';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$$;
RESET ROLE;

ROLLBACK;
\echo 'PASS: leader inventory read-only migration contract'
