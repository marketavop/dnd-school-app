-- Run in an empty disposable PostgreSQL database as a role with CREATE ROLE:
-- psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/character-inventory-items-migration.sql
\set ON_ERROR_STOP on

-- Model the character table and private schema boundary used by custom login.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app_private
  GRANT ALL ON TABLES TO PUBLIC, anon, authenticated;
CREATE TABLE public.characters (id uuid PRIMARY KEY, name text NOT NULL, inventory text);
INSERT INTO public.characters VALUES
  ('20000000-0000-0000-0000-000000000001', 'First character', '- Rope'),
  ('20000000-0000-0000-0000-000000000002', 'Second character', NULL);
CREATE TEMP TABLE characters_before AS SELECT * FROM public.characters;

\ir ../supabase/migrations/20261123120000_character_inventory_items.sql

BEGIN;
DO $$
DECLARE
  first_character constant uuid := '20000000-0000-0000-0000-000000000001';
  second_character constant uuid := '20000000-0000-0000-0000-000000000002';
  item app_private.character_inventory_items%ROWTYPE;
  invalid_change text;
BEGIN
  IF EXISTS (
    (TABLE public.characters EXCEPT TABLE characters_before)
    UNION ALL
    (TABLE characters_before EXCEPT TABLE public.characters)
  ) OR EXISTS (SELECT 1 FROM app_private.character_inventory_items) THEN
    RAISE EXCEPTION 'Migration changed character data or populated structured inventory';
  END IF;

  INSERT INTO app_private.character_inventory_items (character_id, name)
  VALUES (first_character, 'Rope') RETURNING * INTO item;
  IF item.id IS NULL OR item.character_id IS DISTINCT FROM first_character
     OR item.item_type IS DISTINCT FROM 'other' OR item.quantity IS DISTINCT FROM 1
     OR item.not_for_sale IS DISTINCT FROM false OR item.price_gp IS NOT NULL OR item.note IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected item defaults or character association';
  END IF;

  INSERT INTO app_private.character_inventory_items (character_id, name, item_type, price_gp)
  SELECT second_character, 'Item', item_type, 0
  FROM unnest(ARRAY['weapon', 'armor_shield', 'adventuring_gear', 'tool', 'consumable',
                    'magic_item', 'valuable', 'quest_item', 'other']) AS types(item_type);
  IF (SELECT count(*) FROM app_private.character_inventory_items
      WHERE character_id = second_character AND price_gp = 0) <> 9 THEN
    RAISE EXCEPTION 'Expected all nine item types with a stored price of zero';
  END IF;

  UPDATE app_private.character_inventory_items SET price_gp = 2.75, not_for_sale = true, note = 'Personal item'
  WHERE id = item.id RETURNING * INTO item;
  IF item.price_gp IS DISTINCT FROM 2.75 OR item.not_for_sale IS DISTINCT FROM true
     OR item.note IS DISTINCT FROM 'Personal item' THEN
    RAISE EXCEPTION 'A non-sale item must retain its decimal price and note';
  END IF;

  FOREACH invalid_change IN ARRAY ARRAY[
    'name = ''''', 'name = E'' \t\n''', 'quantity = 0', 'quantity = -1', 'item_type = ''unknown''',
    'price_gp = -0.01', 'price_gp = ''NaN''', 'price_gp = ''Infinity'''
  ] LOOP
    BEGIN
      EXECUTE 'UPDATE app_private.character_inventory_items SET ' || invalid_change || ' WHERE id = $1' USING item.id;
      RAISE EXCEPTION 'Invalid update accepted: %', invalid_change;
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;

  BEGIN
    INSERT INTO app_private.character_inventory_items (character_id, name)
    VALUES ('20000000-0000-0000-0000-000000000099', 'Orphan');
    RAISE EXCEPTION 'An item referencing a missing character was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM public.characters WHERE id = first_character;
    RAISE EXCEPTION 'Character deletion with inventory was accepted';
  EXCEPTION WHEN restrict_violation OR foreign_key_violation THEN NULL;
  END;
END;
$$;

DO $$
DECLARE
  inventory_table constant regclass := 'app_private.character_inventory_items'::regclass;
  client_role text;
  privilege_name text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = inventory_table)
     OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = inventory_table) THEN
    RAISE EXCEPTION 'Expected RLS with no client access policies';
  END IF;
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(client_role, inventory_table, privilege_name) THEN
        RAISE EXCEPTION 'Unexpected inventory table privilege: % %', client_role, privilege_name;
      END IF;
    END LOOP;
    EXECUTE format('SET LOCAL ROLE %I', client_role);
    BEGIN
      PERFORM id FROM app_private.character_inventory_items;
      RAISE EXCEPTION 'Direct inventory read accepted for %', client_role;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
  END LOOP;
END;
$$;

ROLLBACK;
\echo 'PASS: character inventory items migration contract'
