BEGIN;

CREATE FUNCTION public.player_update_inventory_item(
  p_session_token text, p_character_id uuid, p_item_id uuid, p_patch jsonb
)
RETURNS TABLE (
  id uuid, character_id uuid, name text, item_type text, quantity integer,
  price_gp numeric, not_for_sale boolean, note text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  player_id uuid;
  new_quantity numeric;
BEGIN
  SELECT s.user_id INTO STRICT player_id FROM app_private.require_session(p_session_token, 'player') s;
  PERFORM FROM app_private.user_characters uc
    WHERE uc.user_id = player_id AND uc.character_id = p_character_id
    FOR KEY SHARE OF uc;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
     OR p_patch = '{}'::jsonb
     OR (p_patch - ARRAY['name', 'item_type', 'quantity', 'price_gp', 'not_for_sale', 'note']) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid inventory item patch' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_patch->'name') <> 'string'
     OR jsonb_typeof(p_patch->'item_type') <> 'string'
     OR jsonb_typeof(p_patch->'quantity') <> 'number'
     OR jsonb_typeof(p_patch->'price_gp') NOT IN ('number', 'null')
     OR jsonb_typeof(p_patch->'not_for_sale') <> 'boolean'
     OR jsonb_typeof(p_patch->'note') NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'Invalid inventory item field type' USING ERRCODE = '22023';
  END IF;

  -- Check the numeric value before casting to avoid rounding fractional quantities.
  new_quantity := (p_patch->>'quantity')::numeric;
  IF new_quantity NOT BETWEEN 1 AND 2147483647 OR new_quantity <> trunc(new_quantity) THEN
    RAISE EXCEPTION 'Inventory quantity must be a positive integer' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    UPDATE app_private.character_inventory_items i SET
      name = coalesce(p_patch->>'name', i.name),
      item_type = coalesce(p_patch->>'item_type', i.item_type),
      quantity = coalesce(new_quantity::integer, i.quantity),
      price_gp = CASE WHEN p_patch ? 'price_gp' THEN (p_patch->>'price_gp')::numeric ELSE i.price_gp END,
      not_for_sale = coalesce((p_patch->>'not_for_sale')::boolean, i.not_for_sale),
      note = CASE WHEN p_patch ? 'note' THEN p_patch->>'note' ELSE i.note END
    WHERE i.id = p_item_id AND i.character_id = p_character_id
    RETURNING i.id, i.character_id, i.name, i.item_type, i.quantity, i.price_gp, i.not_for_sale, i.note;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or unauthorized inventory item' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION public.player_delete_inventory_item(p_session_token text, p_character_id uuid, p_item_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  player_id uuid;
BEGIN
  SELECT s.user_id INTO STRICT player_id FROM app_private.require_session(p_session_token, 'player') s;
  PERFORM FROM app_private.user_characters uc
    WHERE uc.user_id = player_id AND uc.character_id = p_character_id
    FOR KEY SHARE OF uc;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or unauthorized character' USING ERRCODE = '42501';
  END IF;

  DELETE FROM app_private.character_inventory_items i
  WHERE i.id = p_item_id AND i.character_id = p_character_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or unauthorized inventory item' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.player_update_inventory_item(text, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.player_delete_inventory_item(text, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.player_update_inventory_item(text, uuid, uuid, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.player_delete_inventory_item(text, uuid, uuid) TO anon;

-- Remove the grants on the already-deployed INV-02 functions as well.
REVOKE EXECUTE ON FUNCTION public.player_inventory_items(text, uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.player_add_inventory_item(text, uuid, text, text, numeric, numeric, boolean, text)
  FROM service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
