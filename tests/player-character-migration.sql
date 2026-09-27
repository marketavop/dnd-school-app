-- Empty disposable database only. Run after all character/session migrations.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE TABLE public.characters (
  id uuid PRIMARY KEY, user_id uuid, name text NOT NULL,
  portrait_path text, race_code text, class_code text, level integer,
  str integer, dex integer, con integer, int integer, wis integer, cha integer,
  xp integer, current_hp integer, max_hp integer
);
\ir ../supabase/migrations/20260922120000_simple_login.sql
\ir ../supabase/migrations/20260923120000_session_tokens.sql
\ir ../supabase/migrations/20260925160000_player_character_ownership.sql
BEGIN;
INSERT INTO public.characters(id, user_id, name, level, current_hp, max_hp) VALUES
 ('10000000-0000-0000-0000-000000000001', NULL, 'Vlastní', 1, 10, 10),
 ('10000000-0000-0000-0000-000000000002', NULL, 'Cizí', 1, 10, 10);
INSERT INTO app_private.users(username, password_hash, role, character_id) VALUES
 ('owner', extensions.crypt('password', extensions.gen_salt('bf', 12)), 'player', '10000000-0000-0000-0000-000000000001'),
 ('other', extensions.crypt('password', extensions.gen_salt('bf', 12)), 'player', '10000000-0000-0000-0000-000000000002'),
 ('leader', extensions.crypt('password', extensions.gen_salt('bf', 12)), 'leader', NULL);
CREATE TEMP TABLE token AS SELECT session_token FROM public.login('owner', 'password');
GRANT SELECT ON token TO anon;
SET LOCAL ROLE anon;
DO $$
DECLARE t text; r jsonb;
BEGIN
 SELECT session_token INTO t FROM token;
 SELECT to_jsonb(c) INTO r FROM public.player_character(t, '10000000-0000-0000-0000-000000000001') c;
 IF r->>'name' <> 'Vlastní' THEN RAISE EXCEPTION 'Own read failed'; END IF;
 PERFORM * FROM public.player_update_character(t, '10000000-0000-0000-0000-000000000001', '{"level":5}'::jsonb);
 IF (SELECT level FROM public.characters WHERE id = '10000000-0000-0000-0000-000000000001') <> 5 THEN RAISE EXCEPTION 'Own update failed'; END IF;
 FOR r IN SELECT jsonb_build_object('id', x) FROM unnest(ARRAY['10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000099']) x LOOP
   BEGIN PERFORM * FROM public.player_character(t, (r->>'id')::uuid); RAISE EXCEPTION 'Foreign read accepted';
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN PERFORM * FROM public.player_update_character(t, (r->>'id')::uuid, '{"level":9}'::jsonb); RAISE EXCEPTION 'Foreign update accepted';
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 BEGIN PERFORM * FROM public.player_update_character(t, '10000000-0000-0000-0000-000000000001', '{"user_id":"x"}'::jsonb); RAISE EXCEPTION 'Forbidden field accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM public.characters; RAISE EXCEPTION 'Direct SELECT grant remains';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.characters SET level = 9; RAISE EXCEPTION 'Direct UPDATE grant remains';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
