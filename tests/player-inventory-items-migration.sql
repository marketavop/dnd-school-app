-- Run in an empty disposable PostgreSQL database with CREATE ROLE/EXTENSION privileges:
-- psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/player-inventory-items-migration.sql
\set ON_ERROR_STOP on

CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.characters (id uuid PRIMARY KEY, name text NOT NULL);

\ir ../supabase/migrations/20260922120000_simple_login.sql
\ir ../supabase/migrations/20260923120000_session_tokens.sql
\ir ../supabase/migrations/20260924160000_session_ttl_8_hours.sql

-- Match the ownership table from 20260925170000_user_characters_ownership.sql.
CREATE TABLE app_private.user_characters (
  user_id uuid NOT NULL REFERENCES app_private.users(id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, character_id)
);
ALTER TABLE app_private.user_characters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.user_characters FROM PUBLIC, anon, authenticated;

\ir ../supabase/migrations/20261123120000_character_inventory_items.sql
\ir ../supabase/migrations/20261123130000_player_inventory_items.sql

BEGIN;
INSERT INTO public.characters (id, name) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Player A'),
  ('20000000-0000-0000-0000-000000000002', 'Player B'),
  ('20000000-0000-0000-0000-000000000003', 'Second character of A');
INSERT INTO app_private.users (username, password_hash, role, character_id)
SELECT username, extensions.crypt('inventory-password', extensions.gen_salt('bf', 12)), role, character_id
FROM (VALUES
  ('inventory-a', 'player', '20000000-0000-0000-0000-000000000001'::uuid),
  ('inventory-b', 'player', '20000000-0000-0000-0000-000000000002'::uuid),
  ('inventory-leader', 'leader', NULL)
) AS fixture(username, role, character_id);
INSERT INTO app_private.user_characters
SELECT id, character_id FROM app_private.users WHERE character_id IS NOT NULL;
INSERT INTO app_private.user_characters
SELECT id, '20000000-0000-0000-0000-000000000003' FROM app_private.users WHERE username = 'inventory-a';

CREATE TEMP TABLE inventory_sessions (username text PRIMARY KEY, token text NOT NULL);
GRANT SELECT, INSERT ON inventory_sessions TO anon;
SET LOCAL ROLE anon;
INSERT INTO inventory_sessions
SELECT username, l.session_token
FROM (VALUES ('inventory-a'), ('inventory-b'), ('inventory-leader')) AS fixture(username)
CROSS JOIN LATERAL public.login(fixture.username, 'inventory-password') AS l;
RESET ROLE;
INSERT INTO app_private.sessions (token_hash, user_id, role, created_at, expires_at)
SELECT extensions.digest(repeat('e', 64), 'sha256'), id, role,
  clock_timestamp() - interval '9 hours', clock_timestamp() - interval '1 hour'
FROM app_private.users WHERE username = 'inventory-a';

SET LOCAL ROLE anon;
DO $$
DECLARE
  character_a constant uuid := '20000000-0000-0000-0000-000000000001';
  character_b constant uuid := '20000000-0000-0000-0000-000000000002';
  second_character_a constant uuid := '20000000-0000-0000-0000-000000000003';
  token_a constant text := (SELECT token FROM inventory_sessions WHERE username = 'inventory-a');
  token_b constant text := (SELECT token FROM inventory_sessions WHERE username = 'inventory-b');
  leader_token constant text := (SELECT token FROM inventory_sessions WHERE username = 'inventory-leader');
  item record;
  price numeric;
  scenario record;
BEGIN
  IF EXISTS (SELECT FROM public.player_inventory_items(token_a, character_a)) THEN
    RAISE EXCEPTION 'Expected an empty inventory for A';
  END IF;

  SELECT * INTO STRICT item FROM public.player_add_inventory_item(token_b, character_b, 'Shield', 'armor_shield');
  IF item.character_id IS DISTINCT FROM character_b THEN
    RAISE EXCEPTION 'Item was assigned to the wrong character';
  END IF;

  SELECT * INTO STRICT item FROM public.player_add_inventory_item(token_a, character_a, 'Rope', 'adventuring_gear');
  IF item.id IS NULL OR item.character_id IS DISTINCT FROM character_a
     OR item.name IS DISTINCT FROM 'Rope' OR item.item_type IS DISTINCT FROM 'adventuring_gear'
     OR item.quantity IS DISTINCT FROM 1 OR item.price_gp IS NOT NULL
     OR item.not_for_sale IS DISTINCT FROM false OR item.note IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected item or defaults';
  END IF;
  IF (SELECT to_jsonb(i) FROM public.player_inventory_items(token_a, character_a) i)
       IS DISTINCT FROM to_jsonb(item) THEN
    RAISE EXCEPTION 'Read did not return exactly the item just added';
  END IF;
  IF EXISTS (SELECT FROM public.player_inventory_items(token_a, second_character_a)) THEN
    RAISE EXCEPTION 'Two characters on the same account share inventory';
  END IF;

  SELECT * INTO STRICT item FROM public.player_add_inventory_item(
    token_a, character_a, 'Potion', 'consumable', 2, 1.25, true, 'For the quest');
  IF item.quantity IS DISTINCT FROM 2 OR item.price_gp IS DISTINCT FROM 1.25
     OR item.not_for_sale IS DISTINCT FROM true OR item.note IS DISTINCT FROM 'For the quest' THEN
    RAISE EXCEPTION 'Explicit item values were not retained';
  END IF;
  SELECT price_gp INTO STRICT price FROM public.player_add_inventory_item(
    token_a, second_character_a, 'Gift', 'other', p_price_gp => 0);
  IF price IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Zero price must be retained';
  END IF;

  FOR scenario IN SELECT * FROM (VALUES
    ('foreign character with items', token_a, character_b),
    ('other player', token_b, character_a),
    ('unknown character', token_a, '20000000-0000-0000-0000-000000000099'::uuid),
    ('missing character', token_a, NULL),
    ('missing token', NULL, character_a),
    ('malformed token', 'invalid', character_a),
    ('unknown token', repeat('0', 64), character_a),
    ('expired token', repeat('e', 64), character_a),
    ('leader token', leader_token, character_a)
  ) AS cases(description, token, character_id) LOOP
    BEGIN
      PERFORM FROM public.player_inventory_items(scenario.token, scenario.character_id);
      RAISE EXCEPTION 'Read allowed for %', scenario.description;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
      PERFORM FROM public.player_add_inventory_item(scenario.token, scenario.character_id, 'Denied', 'other');
      RAISE EXCEPTION 'Insert allowed for %', scenario.description;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;

  FOR scenario IN SELECT * FROM (VALUES
    (NULL, 'tool', 1::numeric, NULL::numeric, false, '23502'),
    ('', 'tool', 1, NULL, false, '23514'),
    (E' \t\n', 'tool', 1, NULL, false, '23514'),
    ('Item', NULL, 1, NULL, false, '23502'),
    ('Item', 'unknown', 1, NULL, false, '23514'),
    ('Item', 'tool', NULL, NULL, false, '22023'),
    ('Item', 'tool', 0, NULL, false, '22023'),
    ('Item', 'tool', -1, NULL, false, '22023'),
    ('Item', 'tool', 1.5, NULL, false, '22023'),
    ('Item', 'tool', 2147483648, NULL, false, '22023'),
    ('Item', 'tool', 'NaN'::numeric, NULL, false, '22023'),
    ('Item', 'tool', 1, -0.01, false, '23514'),
    ('Item', 'tool', 1, 'Infinity'::numeric, false, '23514'),
    ('Item', 'tool', 1, NULL, NULL, '23502')
  ) AS cases(name, item_type, quantity, price_gp, not_for_sale, expected_state) LOOP
    BEGIN
      PERFORM FROM public.player_add_inventory_item(
        token_a, character_a, scenario.name, scenario.item_type,
        scenario.quantity, scenario.price_gp, scenario.not_for_sale);
      RAISE EXCEPTION 'Invalid item accepted: %', scenario;
    EXCEPTION WHEN not_null_violation OR check_violation OR invalid_parameter_value THEN
      IF SQLSTATE <> scenario.expected_state THEN RAISE; END IF;
    END;
  END LOOP;

  BEGIN
    PERFORM FROM app_private.character_inventory_items;
    RAISE EXCEPTION 'Direct inventory read accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO app_private.character_inventory_items (character_id, name) VALUES (character_a, 'Denied');
    RAISE EXCEPTION 'Direct inventory insert accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM app_private.character_inventory_items) <> 4 THEN
    RAISE EXCEPTION 'Rejected requests left unexpected inventory rows';
  END IF;
  IF has_function_privilege('authenticated', 'public.player_inventory_items(text, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.player_add_inventory_item(text, uuid, text, text, numeric, numeric, boolean, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Inventory RPC execution grant leaked beyond anon';
  END IF;
END;
$$;

-- The legacy users.character_id association remains present after revocation.
DELETE FROM app_private.user_characters
WHERE character_id = '20000000-0000-0000-0000-000000000001';
SET LOCAL ROLE anon;
DO $$
DECLARE
  character_a constant uuid := '20000000-0000-0000-0000-000000000001';
  token_a constant text := (SELECT token FROM inventory_sessions WHERE username = 'inventory-a');
BEGIN
  BEGIN
    PERFORM FROM public.player_inventory_items(token_a, character_a);
    RAISE EXCEPTION 'Read allowed after ownership revocation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM FROM public.player_add_inventory_item(token_a, character_a, 'Denied', 'other');
    RAISE EXCEPTION 'Insert allowed after ownership revocation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;

ROLLBACK;
\echo 'PASS: player inventory read and insert migration contract'
