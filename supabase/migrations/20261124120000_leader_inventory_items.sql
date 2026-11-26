BEGIN;

CREATE FUNCTION public.leader_inventory_items(p_session_token text, p_character_id uuid)
RETURNS TABLE (
  id uuid, character_id uuid, name text, item_type text, quantity integer,
  price_gp numeric, not_for_sale boolean, note text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM FROM app_private.require_session(p_session_token, 'leader');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or unauthorized session' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT i.id, i.character_id, i.name, i.item_type, i.quantity, i.price_gp, i.not_for_sale, i.note
    FROM app_private.character_inventory_items i
    WHERE i.character_id = p_character_id
      AND EXISTS (
        SELECT FROM app_private.user_characters uc
        JOIN app_private.users u ON u.id = uc.user_id
        WHERE uc.character_id = i.character_id AND u.role = 'player'
      )
    ORDER BY i.id;
END;
$$;

REVOKE ALL ON FUNCTION public.leader_inventory_items(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leader_inventory_items(text, uuid) TO anon;

NOTIFY pgrst, 'reload schema';
COMMIT;
