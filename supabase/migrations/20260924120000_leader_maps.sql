BEGIN;

-- Metadata only: grid settings and active state retain their existing sources.
CREATE TABLE app_private.maps (
  map_id text PRIMARY KEY,
  name text NOT NULL,
  image_path text NOT NULL
);
ALTER TABLE app_private.maps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.maps FROM PUBLIC, anon, authenticated;

INSERT INTO app_private.maps (map_id, name, image_path) VALUES
  ('test-map', 'Test map', './assets/maps/test-map.png'),
  ('mapa-akademie', 'Mapa akademie', './assets/maps/mapa-akademie.png');

CREATE FUNCTION public.leader_maps(p_session_token text)
RETURNS TABLE (map_id text, name text, image_path text, cell_size numeric, is_active boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM * FROM app_private.require_session(p_session_token, 'leader');
  RETURN QUERY
    SELECT m.map_id, m.name, m.image_path, c.cell_size::numeric,
      EXISTS (SELECT FROM public.game_state g WHERE g.id = 1 AND g.active_map_id = m.map_id)
    FROM app_private.maps m
    LEFT JOIN public.map_config c ON c.map_id = m.map_id
    ORDER BY m.name, m.map_id;
END;
$$;
REVOKE ALL ON FUNCTION public.leader_maps(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leader_maps(text) TO anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
