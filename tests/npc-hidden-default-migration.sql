-- EMPTY disposable database only; never run against the project database.
\set ON_ERROR_STOP on
\ir npc-placements-migration.sql

CREATE TEMP TABLE placements_before_default AS TABLE app_private.npc_placements;
CREATE TEMP TABLE npc_rpc_acl_before AS
  SELECT proacl FROM pg_proc WHERE oid='public.leader_add_npc_to_map(text,uuid,text,numeric,numeric)'::regprocedure;
\ir ../supabase/migrations/20261008120000_npc_placements_hidden_by_default.sql

BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT * FROM placements_before_default EXCEPT SELECT * FROM app_private.npc_placements)
    OR EXISTS (SELECT * FROM app_private.npc_placements EXCEPT SELECT * FROM placements_before_default) THEN
    RAISE EXCEPTION 'Migration changed existing placements';
  END IF;
  IF (SELECT proacl FROM pg_proc WHERE oid='public.leader_add_npc_to_map(text,uuid,text,numeric,numeric)'::regprocedure)
    IS DISTINCT FROM (SELECT proacl FROM npc_rpc_acl_before) THEN
    RAISE EXCEPTION 'RPC grants changed';
  END IF;
END; $$;

-- Assert visibility at INSERT time, not merely after the RPC has returned.
CREATE FUNCTION pg_temp.assert_hidden_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.visible IS DISTINCT FROM false THEN RAISE EXCEPTION 'Placement was visible at INSERT'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER test_hidden_insert BEFORE INSERT ON app_private.npc_placements
FOR EACH ROW EXECUTE FUNCTION pg_temp.assert_hidden_insert();

DO $$
DECLARE n uuid;
BEGIN
  n := public.leader_create_npc('leader','Default test',NULL);
  INSERT INTO app_private.npc_placements(npc_id,map_id,x,y) VALUES (n,'a',50,50);
END; $$;

SET LOCAL ROLE anon;
DO $$
DECLARE n uuid; p uuid; operation text;
BEGIN
  n := public.leader_create_npc('leader','Hidden by default',NULL);
  p := public.leader_add_npc_to_map('leader',n,'a',150,250);
  IF NOT EXISTS (SELECT FROM public.map_npcs('leader','a') WHERE id=p AND NOT visible) THEN
    RAISE EXCEPTION 'Leader cannot see hidden placement';
  END IF;
  IF EXISTS (SELECT FROM public.map_npcs('player','a') WHERE id=p) THEN RAISE EXCEPTION 'New placement leaked'; END IF;
  PERFORM public.leader_set_npc_position('leader',p,350,450);
  IF NOT EXISTS (SELECT FROM public.map_npcs('leader','a') WHERE id=p AND NOT visible AND x=350 AND y=450) THEN
    RAISE EXCEPTION 'Hidden move failed';
  END IF;
  PERFORM public.leader_set_npc_visibility('leader',p,true);
  IF NOT EXISTS (SELECT FROM public.map_npcs('player','a') WHERE id=p AND visible) THEN RAISE EXCEPTION 'Reveal failed'; END IF;
  IF public.leader_add_npc_to_map('leader',n,'a',50,50) <> p
    OR NOT EXISTS (SELECT FROM public.map_npcs('player','a') WHERE id=p AND visible AND x=350 AND y=450) THEN
    RAISE EXCEPTION 'Repeated add changed existing placement';
  END IF;
  FOREACH operation IN ARRAY ARRAY[
    format('SELECT public.leader_add_npc_to_map(''player'',%L,''a'',50,50)',n),
    format('SELECT public.leader_add_npc_to_map(''invalid'',%L,''a'',50,50)',n),
    format('SELECT public.leader_set_npc_visibility(''player'',%L,true)',p),
    'SELECT * FROM app_private.npc_placements'
  ] LOOP
    BEGIN EXECUTE operation; RAISE EXCEPTION 'Unauthorized operation succeeded: %',operation;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  BEGIN
    PERFORM public.leader_add_npc_to_map('leader',n,'b',50,50);
    RAISE EXCEPTION 'Inactive map accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.leader_remove_npc_from_map('leader',p);
  p := public.leader_add_npc_to_map('leader',n,'a',50,50);
  IF EXISTS (SELECT FROM public.map_npcs('player','a') WHERE id=p) THEN RAISE EXCEPTION 'Re-added placement leaked'; END IF;
END; $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT FROM realtime.test_events WHERE payload <> '{}'::jsonb OR event <> 'changed' OR topic <> 'npc-changes') THEN
    RAISE EXCEPTION 'Realtime data leaked';
  END IF;
  IF EXISTS (SELECT FROM pg_publication_tables WHERE schemaname='app_private' AND tablename='npc_placements') THEN
    RAISE EXCEPTION 'Placements exposed through Postgres Changes';
  END IF;
END; $$;
ROLLBACK;
