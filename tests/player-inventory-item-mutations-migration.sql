-- Run in an empty disposable PostgreSQL database with CREATE ROLE/EXTENSION privileges:
-- psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/player-inventory-item-mutations-migration.sql
\set ON_ERROR_STOP on

-- The INV-02 test rolls back its data and leaves the schema and real session functions.
\ir player-inventory-items-migration.sql
CREATE ROLE service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
-- The INV-02 functions already exist, so default privileges do not affect them.
GRANT EXECUTE ON FUNCTION public.player_inventory_items(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.player_add_inventory_item(text, uuid, text, text, numeric, numeric, boolean, text)
  TO service_role;
DO $$
BEGIN
  IF NOT has_function_privilege('service_role', 'public.player_inventory_items(text, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.player_add_inventory_item(text, uuid, text, text, numeric, numeric, boolean, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Expected service_role to have EXECUTE on both INV-02 functions before INV-03';
  END IF;
END;
$$;

\ir ../supabase/migrations/20261123140000_player_inventory_item_mutations.sql

BEGIN;
INSERT INTO public.characters (id, name) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Player A'),
  ('20000000-0000-0000-0000-000000000002', 'Player B'),
  ('20000000-0000-0000-0000-000000000003', 'Second character of A');
INSERT INTO app_private.users (username, password_hash, role, character_id)
SELECT username, '$2a$12$......................JJuKLOX9OOwo5PceZZXSkaLDvdmgb82', role, character_id
FROM (VALUES
  ('inventory-a', 'player', '20000000-0000-0000-0000-000000000001'::uuid),
  ('inventory-b', 'player', '20000000-0000-0000-0000-000000000002'::uuid),
  ('inventory-leader', 'leader', NULL)
) AS fixture(username, role, character_id);
INSERT INTO app_private.user_characters
SELECT id, character_id FROM app_private.users WHERE character_id IS NOT NULL;
INSERT INTO app_private.user_characters
SELECT id, '20000000-0000-0000-0000-000000000003' FROM app_private.users WHERE username = 'inventory-a';
INSERT INTO app_private.sessions (token_hash, user_id, role, created_at, expires_at)
SELECT extensions.digest(repeat(fixture.token_char, 64), 'sha256'), u.id, u.role,
  clock_timestamp() - interval '2 hours', clock_timestamp() + fixture.expiry
FROM (VALUES
  ('inventory-a', 'a', interval '1 hour'),
  ('inventory-b', 'b', interval '1 hour'),
  ('inventory-leader', 'c', interval '1 hour'),
  ('inventory-a', 'e', interval '-1 hour')
) AS fixture(username, token_char, expiry)
JOIN app_private.users u USING (username);

INSERT INTO app_private.character_inventory_items (id, character_id, name, item_type) VALUES
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Pickaxe', 'tool'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Shield', 'armor_shield'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', 'Key', 'quest_item');

SET LOCAL ROLE anon;
DO $$
DECLARE
  character_a constant uuid := '20000000-0000-0000-0000-000000000001';
  character_b constant uuid := '20000000-0000-0000-0000-000000000002';
  second_character_a constant uuid := '20000000-0000-0000-0000-000000000003';
  target_item uuid;
  retained_item constant uuid := '30000000-0000-0000-0000-000000000002';
  foreign_item constant uuid := '30000000-0000-0000-0000-000000000003';
  second_character_item constant uuid := '30000000-0000-0000-0000-000000000004';
  token_a constant text := repeat('a', 64);
  token_b constant text := repeat('b', 64);
  item record;
  cleared_item jsonb;
  scenario record;
BEGIN
  SELECT id INTO STRICT target_item FROM public.player_add_inventory_item(
    token_a, character_a, 'Rope', 'adventuring_gear');
  SELECT * INTO STRICT item FROM public.player_update_inventory_item(
    token_a, character_a, target_item,
    '{"name":"Torch","item_type":"consumable","quantity":3,"price_gp":1.25,"not_for_sale":true,"note":"Keep"}');
  IF item.id IS DISTINCT FROM target_item OR item.character_id IS DISTINCT FROM character_a
     OR item.name IS DISTINCT FROM 'Torch' OR item.item_type IS DISTINCT FROM 'consumable'
     OR item.quantity IS DISTINCT FROM 3 OR item.price_gp IS DISTINCT FROM 1.25
     OR item.not_for_sale IS DISTINCT FROM true OR item.note IS DISTINCT FROM 'Keep' THEN
    RAISE EXCEPTION 'Unexpected result from multi-field update';
  END IF;
  SELECT * INTO STRICT item FROM public.player_update_inventory_item(
    token_a, character_a, target_item, '{"price_gp":0}');
  IF item.price_gp IS DISTINCT FROM 0 OR item.note IS DISTINCT FROM 'Keep' THEN
    RAISE EXCEPTION 'Single-field patch failed to save zero or changed an omitted field';
  END IF;
  SELECT * INTO STRICT item FROM public.player_update_inventory_item(
    token_a, character_a, target_item, '{"price_gp":null,"note":null}');
  IF item.price_gp IS NOT NULL OR item.note IS NOT NULL
     OR item.name IS DISTINCT FROM 'Torch' OR item.quantity IS DISTINCT FROM 3
     OR item.item_type IS DISTINCT FROM 'consumable' OR item.not_for_sale IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Explicit null did not clear price and note or changed an omitted field';
  END IF;
  cleared_item := to_jsonb(item);

  FOR scenario IN SELECT * FROM (VALUES
    (NULL::jsonb, '22023'),
    ('null', '22023'),
    ('[]', '22023'),
    ('{}', '22023'),
    ('{"id":"30000000-0000-0000-0000-000000000009"}', '22023'),
    ('{"character_id":"20000000-0000-0000-0000-000000000003"}', '22023'),
    ('{"name":null}', '22023'),
    ('{"name":"   "}', '23514'),
    ('{"item_type":"invalid"}', '23514'),
    ('{"quantity":null}', '22023'),
    ('{"quantity":"3"}', '22023'),
    ('{"quantity":0}', '22023'),
    ('{"quantity":-1}', '22023'),
    ('{"quantity":2147483648}', '22023'),
    ('{"name":"Should not persist","quantity":1.5}', '22023'),
    ('{"name":"Should not persist","price_gp":-0.01}', '23514'),
    ('{"price_gp":"NaN"}', '22023'),
    ('{"not_for_sale":"false"}', '22023'),
    ('{"note":[]}', '22023')
  ) AS cases(patch, expected_state) LOOP
    BEGIN
      PERFORM FROM public.player_update_inventory_item(token_a, character_a, target_item, scenario.patch);
      RAISE EXCEPTION 'Invalid patch accepted: %', scenario.patch;
    EXCEPTION WHEN invalid_parameter_value OR check_violation THEN
      IF SQLSTATE <> scenario.expected_state THEN RAISE; END IF;
    END;
  END LOOP;

  FOR scenario IN SELECT * FROM (VALUES
    ('foreign character', token_a, character_b, foreign_item),
    ('foreign item with owned character', token_a, character_a, foreign_item),
    ('other owned character item', token_a, character_a, second_character_item),
    ('reversed owned characters', token_a, second_character_a, target_item),
    ('missing item', token_a, character_a, '30000000-0000-0000-0000-000000000099'::uuid),
    ('null item ID', token_a, character_a, NULL),
    ('null character ID', token_a, NULL, target_item),
    ('missing token', NULL, character_a, target_item),
    ('invalid token', 'invalid', character_a, target_item),
    ('unknown token', repeat('0', 64), character_a, target_item),
    ('expired token', repeat('e', 64), character_a, target_item),
    ('leader token', repeat('c', 64), character_a, target_item)
  ) AS cases(description, token, character_id, item_id) LOOP
    BEGIN
      PERFORM FROM public.player_update_inventory_item(scenario.token, scenario.character_id, scenario.item_id, '{"name":"Denied"}');
      RAISE EXCEPTION 'Update allowed for %', scenario.description;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM public.player_delete_inventory_item(scenario.token, scenario.character_id, scenario.item_id);
      RAISE EXCEPTION 'Delete allowed for %', scenario.description;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;

  IF (SELECT to_jsonb(i) FROM public.player_inventory_items(token_a, character_a) i WHERE i.id = target_item)
       IS DISTINCT FROM cleared_item THEN
    RAISE EXCEPTION 'A rejected request changed the target item';
  END IF;

  PERFORM public.player_delete_inventory_item(token_a, character_a, target_item);
  IF (SELECT array_agg(id) FROM public.player_inventory_items(token_a, character_a))
       IS DISTINCT FROM ARRAY[retained_item]
     OR (SELECT name FROM public.player_inventory_items(token_b, character_b) WHERE id = foreign_item)
       IS DISTINCT FROM 'Shield'
     OR (SELECT name FROM public.player_inventory_items(token_a, second_character_a) WHERE id = second_character_item)
       IS DISTINCT FROM 'Key' THEN
    RAISE EXCEPTION 'Delete removed or changed an unrelated item, or left the target item';
  END IF;
  BEGIN
    PERFORM public.player_delete_inventory_item(token_a, character_a, target_item);
    RAISE EXCEPTION 'Repeat delete accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE app_private.character_inventory_items SET name = 'Denied' WHERE id = retained_item;
    RAISE EXCEPTION 'Direct inventory update accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM app_private.character_inventory_items WHERE id = retained_item;
    RAISE EXCEPTION 'Direct inventory delete accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

DO $$
DECLARE
  rpc_signature text;
  client_role text;
BEGIN
  FOREACH rpc_signature IN ARRAY ARRAY[
    'public.player_inventory_items(text, uuid)',
    'public.player_add_inventory_item(text, uuid, text, text, numeric, numeric, boolean, text)',
    'public.player_update_inventory_item(text, uuid, uuid, jsonb)',
    'public.player_delete_inventory_item(text, uuid, uuid)'
  ] LOOP
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF has_function_privilege(client_role, rpc_signature, 'EXECUTE') IS DISTINCT FROM (client_role = 'anon') THEN
        RAISE EXCEPTION 'Unexpected EXECUTE privilege for % on %', client_role, rpc_signature;
      END IF;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) FROM public.characters) <> 3 THEN
    RAISE EXCEPTION 'An inventory operation affected characters';
  END IF;
END;
$$;

-- Remove the ownership link while leaving the legacy association and item in place.
DELETE FROM app_private.user_characters
WHERE character_id = '20000000-0000-0000-0000-000000000001';
SET LOCAL ROLE anon;
DO $$
DECLARE
  character_a constant uuid := '20000000-0000-0000-0000-000000000001';
  retained_item constant uuid := '30000000-0000-0000-0000-000000000002';
  token_a constant text := repeat('a', 64);
BEGIN
  BEGIN
    PERFORM FROM public.player_update_inventory_item(token_a, character_a, retained_item, '{"name":"Denied"}');
    RAISE EXCEPTION 'Update allowed after ownership revocation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.player_delete_inventory_item(token_a, character_a, retained_item);
    RAISE EXCEPTION 'Delete allowed after ownership revocation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

ROLLBACK;
\echo 'PASS: player inventory update and delete migration contract'
