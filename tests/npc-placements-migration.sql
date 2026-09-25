-- EMPTY disposable database only. Includes 5A test/session fixtures.
\set ON_ERROR_STOP on
\ir npcs-migration.sql
INSERT INTO app_private.npc_tokens(id,map_id,name,image_url,x,y,visible) VALUES
 ('11111111-1111-4111-8111-111111111111','a','Goblin','https://example.test/g.png',150,250,true),
 ('22222222-2222-4222-8222-222222222222','b','Goblin','https://example.test/g.png',350,450,false),
 ('33333333-3333-4333-8333-333333333333','a','',NULL,50,50,false);
CREATE TEMP TABLE before_npcs AS SELECT * FROM app_private.npc_tokens;
\ir ../supabase/migrations/20260925140000_npc_definitions_placements.sql
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM app_private.npcs) <> 3 OR
     (SELECT count(*) FROM app_private.npc_placements) <> 3 THEN RAISE EXCEPTION 'Data lost or deduplicated'; END IF;
  IF EXISTS (
    SELECT id,map_id,name,image_url,x,y,visible FROM before_npcs
    EXCEPT SELECT p.id,p.map_id,n.name,n.image_url,p.x,p.y,p.visible
      FROM app_private.npc_placements p JOIN app_private.npcs n ON n.id=p.npc_id
  ) THEN RAISE EXCEPTION 'Migrated data changed'; END IF;
  IF to_regprocedure('public.leader_add_npc(text,text,text,text,numeric,numeric,boolean)') IS NOT NULL
    OR to_regprocedure('public.leader_remove_npc(text,uuid)') IS NOT NULL
    OR to_regclass('app_private.npc_tokens') IS NOT NULL THEN RAISE EXCEPTION 'Legacy model still active'; END IF;
  IF (SELECT count(*) FROM app_private.npc_tokens_5a_backup) <> 3 THEN RAISE EXCEPTION 'Backup missing'; END IF;
END; $$;
SET LOCAL ROLE anon;
DO $$
DECLARE n uuid; p uuid; operation text;
BEGIN
  n := public.leader_create_npc('leader','New NPC',NULL);
  IF EXISTS (SELECT FROM public.map_npcs('leader','a') WHERE npc_id=n) THEN RAISE EXCEPTION 'Create auto-placed NPC'; END IF;
  p := public.leader_add_npc_to_map('leader',n,'a',150,150);
  IF public.leader_add_npc_to_map('leader',n,'a',250,250) <> p THEN RAISE EXCEPTION 'Duplicate placement'; END IF;
  IF NOT EXISTS (SELECT FROM public.map_npcs('player','a') WHERE id=p AND x=150) THEN RAISE EXCEPTION 'Duplicate changed position'; END IF;
  PERFORM public.leader_set_npc_position('leader',p,350,450);
  IF NOT EXISTS (SELECT FROM public.leader_npcs('leader') WHERE id=n AND name='New NPC' AND image_url IS NULL) THEN
    RAISE EXCEPTION 'Move changed definition'; END IF;
  PERFORM public.leader_set_npc_visibility('leader',p,false);
  IF EXISTS (SELECT FROM public.map_npcs('player','a') WHERE id=p) THEN RAISE EXCEPTION 'Hidden leaked'; END IF;
  PERFORM public.leader_set_npc_visibility('leader',p,true);
  IF NOT EXISTS (SELECT FROM public.map_npcs('player','a') WHERE id=p) THEN RAISE EXCEPTION 'Reveal failed'; END IF;
  PERFORM public.leader_remove_npc_from_map('leader',p);
  IF NOT EXISTS (SELECT FROM public.leader_npcs('leader') WHERE id=n) THEN RAISE EXCEPTION 'Remove deleted definition'; END IF;
  IF EXISTS (SELECT FROM public.map_npcs('leader','a') WHERE npc_id=n) THEN RAISE EXCEPTION 'Remove failed'; END IF;
  p := public.leader_add_npc_to_map('leader',n,'a',50,50);
  FOREACH operation IN ARRAY ARRAY[
    'SELECT * FROM public.leader_npcs(''player'')',
    'SELECT public.leader_create_npc(''player'',''Bad'',NULL)',
    format('SELECT public.leader_delete_npc(''player'',%L)',n),
    format('SELECT public.leader_add_npc_to_map(''player'',%L,''a'',50,50)',n),
    format('SELECT public.leader_remove_npc_from_map(''player'',%L)',p),
    format('SELECT public.leader_set_npc_position(''player'',%L,50,50)',p),
    format('SELECT public.leader_set_npc_visibility(''player'',%L,true)',p),
    'SELECT * FROM public.map_npcs(''invalid'',''a'')',
    'SELECT * FROM public.leader_npcs(''expired'')',
    'SELECT * FROM app_private.npcs',
    'SELECT * FROM app_private.npc_placements',
    'SELECT * FROM app_private.npc_tokens_5a_backup'
  ] LOOP
    BEGIN EXECUTE operation; RAISE EXCEPTION 'Unauthorized operation succeeded: %',operation;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
END; $$;
RESET ROLE;
UPDATE public.game_state SET active_map_id='b' WHERE id=1;
SET LOCAL ROLE anon;
DO $$
DECLARE n uuid; p uuid;
BEGIN
  SELECT id INTO STRICT n FROM public.leader_npcs('leader') WHERE name='New NPC';
  p := public.leader_add_npc_to_map('leader',n,'b',650,750);
  PERFORM public.leader_set_npc_visibility('leader',p,false);
  IF EXISTS (SELECT FROM public.map_npcs('player','a')) THEN RAISE EXCEPTION 'Inactive map leaked'; END IF;
  IF NOT EXISTS (SELECT FROM public.map_npcs('leader','a') WHERE npc_id=n AND visible AND x=50) THEN RAISE EXCEPTION 'Per-map values lost'; END IF;
  IF EXISTS (SELECT FROM public.map_npcs('player','b')) THEN RAISE EXCEPTION 'Hidden placement leaked'; END IF;
  PERFORM public.leader_delete_npc('leader',n);
  IF EXISTS (SELECT FROM public.leader_npcs('leader') WHERE id=n)
    OR EXISTS (SELECT FROM public.map_npcs('leader','a') WHERE npc_id=n)
    OR EXISTS (SELECT FROM public.map_npcs('leader','b') WHERE npc_id=n) THEN RAISE EXCEPTION 'Cascade failed'; END IF;
END; $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT FROM realtime.test_events WHERE payload <> '{}'::jsonb OR event <> 'changed' OR topic <> 'npc-changes') THEN
    RAISE EXCEPTION 'Realtime data leaked'; END IF;
END; $$;
ROLLBACK;
