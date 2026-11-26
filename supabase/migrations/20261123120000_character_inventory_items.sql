BEGIN;

CREATE TABLE app_private.character_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (name ~ '[^[:space:]]'),
  item_type text NOT NULL DEFAULT 'other' CHECK (item_type IN (
    'weapon', 'armor_shield', 'adventuring_gear', 'tool', 'consumable',
    'magic_item', 'valuable', 'quest_item', 'other'
  )),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price_gp numeric CHECK (price_gp >= 0 AND price_gp < 'Infinity'::numeric),
  not_for_sale boolean NOT NULL DEFAULT false,
  note text
);

CREATE INDEX character_inventory_items_character_id_idx
  ON app_private.character_inventory_items (character_id);

-- Future inventory RPCs will authorize the custom session before accessing this table.
ALTER TABLE app_private.character_inventory_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.character_inventory_items FROM PUBLIC, anon, authenticated;

COMMIT;
