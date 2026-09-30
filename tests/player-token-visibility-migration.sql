-- EMPTY disposable PostgreSQL database only; migrations commit DDL.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.characters (id uuid PRIMARY KEY, user_id uuid, name text NOT NULL, portrait_path text,
  race_code text, class_code text, level integer, str integer, dex integer, con integer, int integer, wis integer, cha integer,
  xp integer, current_hp integer, max_hp integer);
CREATE TABLE public.map_config (map_id text PRIMARY KEY, cell_size numeric);
CREATE TABLE public.game_state (id integer PRIMARY KEY, active_map_id text);
CREATE TABLE public.token_positions (character_id uuid REFERENCES public.characters(id), map_id text,
  x numeric NOT NULL, y numeric NOT NULL, PRIMARY KEY(character_id,map_id));
INSERT INTO public.game_state VALUES (1,'test-map');
\ir ../supabase/migrations/20260922120000_simple_login.sql
\ir ../supabase/migrations/20260923120000_session_tokens.sql
\ir ../supabase/migrations/20260924120000_leader_maps.sql
\ir ../supabase/migrations/20260924140000_player_tokens.sql
\ir ../supabase/migrations/20260925170000_user_characters_ownership.sql
CREATE TEMP TABLE write_contract AS SELECT oid, pg_get_functiondef(oid) AS definition FROM pg_proc
  WHERE oid IN ('app_private.require_token_access(text,uuid,text)'::regprocedure,
    'public.add_token(text,uuid,text,numeric,numeric)'::regprocedure,
    'public.set_token_position(text,uuid,text,numeric,numeric)'::regprocedure,
    'public.remove_token(text,uuid,text)'::regprocedure);
\ir ../supabase/migrations/20260930120000_player_token_visibility.sql
BEGIN;
INSERT INTO public.characters(id,name) VALUES
 ('10000000-0000-0000-0000-000000000001','A'),('10000000-0000-0000-0000-000000000002','B'),
 ('10000000-0000-0000-0000-000000000003','Absent foreign'),('10000000-0000-0000-0000-000000000004','Unassigned');
INSERT INTO app_private.users(username,password_hash,role,character_id) VALUES
 ('a',extensions.crypt('password',extensions.gen_salt('bf',4)),'player','10000000-0000-0000-0000-000000000001'),
 ('b',extensions.crypt('password',extensions.gen_salt('bf',4)),'player','10000000-0000-0000-0000-000000000002'),
 ('c',extensions.crypt('password',extensions.gen_salt('bf',4)),'player','10000000-0000-0000-0000-000000000003'),
 ('leader',extensions.crypt('password',extensions.gen_salt('bf',4)),'leader',NULL);
INSERT INTO app_private.user_characters SELECT id,character_id FROM app_private.users WHERE character_id IS NOT NULL;
INSERT INTO public.token_positions VALUES
 ('10000000-0000-0000-0000-000000000001','test-map',150,250),
 ('10000000-0000-0000-0000-000000000002','test-map',350,450),
 ('10000000-0000-0000-0000-000000000004','test-map',550,650),
 ('10000000-0000-0000-0000-000000000002','mapa-akademie',750,850);
CREATE TEMP TABLE sessions AS SELECT u.username,l.session_token FROM app_private.users u
  CROSS JOIN LATERAL public.login(u.username,'password') l;
GRANT SELECT ON sessions TO anon;
SET LOCAL ROLE anon;
DO $$
DECLARE ta text; tb text; tl text; operation text;
  a uuid := '10000000-0000-0000-0000-000000000001';
  b uuid := '10000000-0000-0000-0000-000000000002';
BEGIN
  SELECT session_token INTO STRICT ta FROM sessions WHERE username='a';
  SELECT session_token INTO STRICT tb FROM sessions WHERE username='b';
  SELECT session_token INTO STRICT tl FROM sessions WHERE username='leader';
  IF (SELECT count(*) FROM public.player_token(ta,'test-map')) <> 2
    OR (SELECT count(*) FROM public.player_token(tb,'test-map')) <> 2 THEN RAISE EXCEPTION 'Both players must see both present tokens only'; END IF;
  IF NOT EXISTS (SELECT FROM public.player_token(ta,'test-map') WHERE character_id=b AND x=350 AND y=450) THEN RAISE EXCEPTION 'Foreign position missing'; END IF;
  FOREACH operation IN ARRAY ARRAY[
    format('SELECT * FROM public.add_token(%L,%L,''test-map'',50,50)',ta,b),
    format('SELECT * FROM public.set_token_position(%L,%L,''test-map'',50,50)',ta,b),
    format('SELECT public.remove_token(%L,%L,''test-map'')',ta,b),
    format('SELECT * FROM public.player_token(%L,''mapa-akademie'')',ta),
    'SELECT * FROM public.player_token(''invalid'',''test-map'')'
  ] LOOP
    BEGIN EXECUTE operation; RAISE EXCEPTION 'Unauthorized operation succeeded: %',operation;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  PERFORM public.remove_token(tb,b,'test-map');
  IF (SELECT count(*) FROM public.player_token(ta,'test-map')) <> 1 THEN RAISE EXCEPTION 'Absent foreign row leaked'; END IF;
  IF NOT EXISTS (SELECT FROM public.player_token(tb,'test-map') WHERE character_id=b AND x IS NULL AND y IS NULL) THEN RAISE EXCEPTION 'Own absent state missing'; END IF;
  PERFORM * FROM public.add_token(tb,b,'test-map',550,650);
  PERFORM * FROM public.set_token_position(tb,b,'test-map',650,750);
  IF NOT EXISTS (SELECT FROM public.player_token(ta,'test-map') WHERE character_id=b AND x=650 AND y=750) THEN RAISE EXCEPTION 'Own write/read regression'; END IF;
  IF (SELECT count(*) FROM public.leader_player_tokens(tl,'test-map')) <> 3 THEN RAISE EXCEPTION 'Leader roster changed'; END IF;
  PERFORM * FROM public.set_token_position(tl,b,'test-map',150,150);
END; $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT FROM write_contract WHERE definition <> pg_get_functiondef(oid)) THEN RAISE EXCEPTION 'Write contract changed'; END IF;
END; $$;
UPDATE app_private.sessions SET created_at=clock_timestamp()-interval '2 hours', expires_at=clock_timestamp()-interval '1 hour';
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM * FROM public.player_token((SELECT session_token FROM sessions WHERE username='a'),'test-map');
    RAISE EXCEPTION 'Expired session accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
ROLLBACK;
