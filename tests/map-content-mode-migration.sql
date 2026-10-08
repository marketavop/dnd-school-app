-- Run against a disposable Supabase/PostgreSQL test database after migrations.
DO $$
DECLARE
  mode text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'map_config' AND column_name = 'content_mode'
  ) THEN RAISE EXCEPTION 'content_mode column is missing'; END IF;

  SELECT content_mode INTO mode FROM public.map_config LIMIT 1;
  IF mode IS DISTINCT FROM 'map' THEN RAISE EXCEPTION 'existing map default is not map'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.map_config'::regclass AND conname LIKE '%content_mode%'
  ) THEN RAISE EXCEPTION 'content_mode check constraint is missing'; END IF;

  BEGIN
    INSERT INTO public.map_config(map_id, cell_size, content_mode)
      VALUES ('__invalid_content_mode__', 100, 'letter');
    RAISE EXCEPTION 'invalid content mode was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- The following should be executed with a leader session token in an integration test:
-- SELECT * FROM public.leader_set_map_content_mode('<leader-token>', '<map-id>', 'image');
-- SELECT content_mode FROM public.map_config WHERE map_id = '<map-id>';
-- A player token and a direct UPDATE must both fail.
