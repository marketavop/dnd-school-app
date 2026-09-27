-- Empty disposable database; run after the existing character/session/token migrations.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.characters (id uuid PRIMARY KEY, user_id uuid, name text NOT NULL, portrait_path text,
  race_code text, class_code text, level integer, str integer, dex integer, con integer, int integer, wis integer, cha integer,
  xp integer, current_hp integer, max_hp integer);
CREATE TABLE public.maps (map_id text PRIMARY KEY);
CREATE TABLE public.token_positions (character_id uuid, map_id text, x numeric, y numeric, PRIMARY KEY(character_id,map_id));
\ir ../supabase/migrations/20260922120000_simple_login.sql
\ir ../supabase/migrations/20260923120000_session_tokens.sql
\ir ../supabase/migrations/20260925160000_player_character_ownership.sql
\ir ../supabase/migrations/20260924140000_player_tokens.sql
\ir ../supabase/migrations/20260925170000_user_characters_ownership.sql
BEGIN;
INSERT INTO public.maps VALUES ('test-map');
INSERT INTO public.characters(id,name,current_hp,max_hp) VALUES
 ('10000000-0000-0000-0000-000000000001','One',10,10),('10000000-0000-0000-0000-000000000002','Two',10,10),('10000000-0000-0000-0000-000000000003','Other',10,10);
INSERT INTO app_private.users(username,password_hash,role,character_id) VALUES
 ('player',extensions.crypt('password',extensions.gen_salt('bf',12)),'player','10000000-0000-0000-0000-000000000001'),
 ('other',extensions.crypt('password',extensions.gen_salt('bf',12)),'player','10000000-0000-0000-0000-000000000003'),
 ('leader',extensions.crypt('password',extensions.gen_salt('bf',12)),'leader',NULL);
INSERT INTO app_private.user_characters SELECT id, character_id FROM app_private.users WHERE character_id IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO app_private.user_characters VALUES ((SELECT id FROM app_private.users WHERE username='player'),'10000000-0000-0000-0000-000000000002') ON CONFLICT DO NOTHING;
CREATE TEMP TABLE tokens AS SELECT username, session_token FROM app_private.users u JOIN LATERAL public.login(u.username,'password') l ON true;
GRANT SELECT ON tokens TO anon;
SET LOCAL ROLE anon;
DO $$ DECLARE t text; r jsonb; BEGIN
 SELECT session_token INTO t FROM tokens WHERE username='player';
 SELECT to_jsonb(c) INTO r FROM public.player_character(t,'10000000-0000-0000-0000-000000000002') c;
 IF r->>'name' <> 'Two' THEN RAISE EXCEPTION 'Second owned character denied'; END IF;
 PERFORM * FROM public.player_update_character(t,'10000000-0000-0000-0000-000000000002','{"level":2}'::jsonb);
 BEGIN PERFORM * FROM public.player_character(t,'10000000-0000-0000-0000-000000000003'); RAISE EXCEPTION 'Foreign read accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 DELETE FROM app_private.user_characters WHERE user_id=(SELECT id FROM app_private.users WHERE username='player') AND character_id='10000000-0000-0000-0000-000000000002';
 BEGIN PERFORM * FROM public.player_character(t,'10000000-0000-0000-0000-000000000002'); RAISE EXCEPTION 'Removed ownership accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
