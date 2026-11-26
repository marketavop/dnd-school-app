BEGIN;

CREATE FUNCTION public.player_inventory_items(p_session_token text, p_character_id uuid)
RETURNS TABLE (
  id uuid, character_id uuid, name text, item_type text, quantity integer,
  price_gp numeric, not_for_sale boolean, note text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  player_id uuid;
BEGIN
  SELECT s.user_id INTO STRICT player_id FROM app_private.require_session(p_session_token, 'player') s;
  IF NOT EXISTS (
    SELECT FROM app_private.user_characters uc
    WHERE uc.user_id = player_id AND uc.character_id = p_character_id
  ) THEN
    RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT i.id, i.character_id, i.name, i.item_type, i.quantity, i.price_gp, i.not_for_sale, i.note
    FROM app_private.character_inventory_items i
    WHERE i.character_id = p_character_id
    ORDER BY i.id;
END;
$$;

CREATE FUNCTION public.player_add_inventory_item(
  p_session_token text,
  p_character_id uuid,
  p_name text,
  p_item_type text,
  p_quantity numeric DEFAULT 1,
  p_price_gp numeric DEFAULT NULL,
  p_not_for_sale boolean DEFAULT false,
  p_note text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, character_id uuid, name text, item_type text, quantity integer,
  price_gp numeric, not_for_sale boolean, note text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  player_id uuid;
BEGIN
  SELECT s.user_id INTO STRICT player_id FROM app_private.require_session(p_session_token, 'player') s;
  -- Keep the ownership link in place until the insert transaction finishes.
  PERFORM FROM app_private.user_characters uc
    WHERE uc.user_id = player_id AND uc.character_id = p_character_id
    FOR KEY SHARE OF uc;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501';
  END IF;

  -- Casting a numeric directly to integer would round fractional quantities.
  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 2147483647
     OR p_quantity <> trunc(p_quantity) THEN
    RAISE EXCEPTION 'Inventory quantity must be a positive integer' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    INSERT INTO app_private.character_inventory_items AS i
      (character_id, name, item_type, quantity, price_gp, not_for_sale, note)
    VALUES (p_character_id, p_name, p_item_type, p_quantity::integer, p_price_gp, p_not_for_sale, p_note)
    RETURNING i.id, i.character_id, i.name, i.item_type, i.quantity, i.price_gp, i.not_for_sale, i.note;
END;
$$;

REVOKE ALL ON FUNCTION public.player_inventory_items(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.player_add_inventory_item(text, uuid, text, text, numeric, numeric, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_inventory_items(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.player_add_inventory_item(text, uuid, text, text, numeric, numeric, boolean, text)
  TO anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
