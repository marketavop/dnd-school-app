-- Run only in an EMPTY disposable database, never the project database.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE SCHEMA app_private;
CREATE SCHEMA realtime;
CREATE TABLE app_private.maps(map_id text PRIMARY KEY);
CREATE TABLE public.game_state(id integer PRIMARY KEY, active_map_id text);
INSERT INTO app_private.maps VALUES ('a'), ('b');
INSERT INTO public.game_state VALUES (1, 'a');
-- Session fixture: production require_session is not replaced by the migration.
CREATE FUNCTION app_private.require_session(token text, required_role text DEFAULT NULL)
RETURNS TABLE(role text) LANGUAGE plpgsql AS $$
BEGIN
  IF token NOT IN ('leader', 'player') OR token IS NULL
    OR (required_role IS NOT NULL AND token <> required_role) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT token;
END;
$$;
CREATE TABLE realtime.test_events(payload jsonb, event text, topic text, private boolean);
CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean)
RETURNS void LANGUAGE sql AS $$ INSERT INTO realtime.test_events VALUES ($1,$2,$3,$4); $$;
\ir ../supabase/migrations/20260925120000_npc_tokens.sql
BEGIN;
SET LOCAL ROLE anon;
DO $$
DECLARE npc uuid; hidden uuid; operation text;
BEGIN
  npc := public.leader_add_npc('leader','a','Goblin',NULL,150,250,true);
  hidden := public.leader_add_npc('leader','a','Secret','https://example.test/image.png',350,450,false);
  IF (SELECT count(*) FROM public.map_npcs('player','a')) <> 1 THEN RAISE EXCEPTION 'Hidden NPC leaked'; END IF;
  IF (SELECT count(*) FROM public.map_npcs('leader','a')) <> 2 THEN RAISE EXCEPTION 'Leader missing NPC'; END IF;
  PERFORM public.leader_set_npc_visibility('leader', hidden, true);
  IF (SELECT count(*) FROM public.map_npcs('player','a')) <> 2 THEN RAISE EXCEPTION 'Reveal failed'; END IF;
  PERFORM public.leader_set_npc_visibility('leader', hidden, false);
  PERFORM public.leader_set_npc_position('leader', npc, 550, 650);
  IF NOT EXISTS (SELECT FROM public.map_npcs('player','a') WHERE x=550 AND y=650) THEN RAISE EXCEPTION 'Move failed'; END IF;
  FOREACH operation IN ARRAY ARRAY[
    'SELECT public.leader_add_npc(''player'',''a'','''',NULL,50,50,true)',
    format('SELECT public.leader_set_npc_position(''player'',%L,50,50)', npc),
    format('SELECT public.leader_set_npc_visibility(''player'',%L,true)', hidden),
    format('SELECT public.leader_remove_npc(''player'',%L)', npc),
    'SELECT * FROM public.map_npcs(''expired'',''a'')',
    'SELECT * FROM public.map_npcs(''invalid'',''a'')',
    'SELECT * FROM app_private.npc_tokens'
  ] LOOP
    BEGIN
      EXECUTE operation;
      RAISE EXCEPTION 'Unauthorized operation succeeded: %', operation;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  PERFORM public.leader_remove_npc('leader', npc);
  IF EXISTS (SELECT FROM public.map_npcs('player','a')) THEN RAISE EXCEPTION 'Delete/hide failed'; END IF;
END;
$$;
RESET ROLE;
UPDATE public.game_state SET active_map_id='b' WHERE id=1;
SET LOCAL ROLE anon;
SELECT public.leader_add_npc('leader','b','Other map',NULL,50,50,true);
DO $$ BEGIN
  IF EXISTS (SELECT FROM public.map_npcs('player','a')) THEN RAISE EXCEPTION 'Inactive map leaked'; END IF;
  IF (SELECT count(*) FROM public.map_npcs('leader','a')) <> 1 THEN RAISE EXCEPTION 'Map-specific persistence lost'; END IF;
END; $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM realtime.test_events) THEN RAISE EXCEPTION 'No realtime events'; END IF;
  IF EXISTS (SELECT FROM realtime.test_events WHERE payload <> '{}'::jsonb OR event <> 'changed'
    OR topic <> 'npc-changes' OR private) THEN RAISE EXCEPTION 'Realtime leaked payload'; END IF;
END; $$;
ROLLBACK;
