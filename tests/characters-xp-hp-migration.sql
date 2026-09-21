-- Run only against an EMPTY disposable PostgreSQL database:
-- psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/characters-xp-hp-migration.sql
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.characters (
    id uuid PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    name text NOT NULL
);
\ir ../supabase/migrations/20260921120000_extend_characters_sheet.sql

INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO public.characters
    (id, user_id, name, portrait_path, race_code, class_code, level, str, dex, con, int, wis, cha)
VALUES
    ('00000000-0000-0000-0000-000000000002',
     '00000000-0000-0000-0000-000000000001', 'Existing character',
     '/portrait.png', 'elf', 'wizard', 3, 15, 12, 10, 16, 9, 8),
    ('00000000-0000-0000-0000-000000000003', NULL, 'Empty character',
     NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
CREATE TEMP TABLE characters_before AS SELECT to_jsonb(c) AS data FROM public.characters c;

\ir ../supabase/migrations/20260921130000_extend_characters_xp_hp.sql

DO $$
DECLARE
    field text;
    value integer;
    stored integer;
    rejected_by text;
BEGIN
    IF EXISTS (
        (SELECT to_jsonb(c) - ARRAY['xp', 'current_hp', 'max_hp'] FROM public.characters c
         EXCEPT SELECT data FROM characters_before)
        UNION ALL
        (SELECT data FROM characters_before EXCEPT
         SELECT to_jsonb(c) - ARRAY['xp', 'current_hp', 'max_hp'] FROM public.characters c)
    ) THEN
        RAISE EXCEPTION 'Existing character data changed';
    END IF;
    IF EXISTS (SELECT 1 FROM public.characters WHERE xp IS NOT NULL OR current_hp IS NOT NULL OR max_hp IS NOT NULL) THEN
        RAISE EXCEPTION 'New fields must initially be NULL';
    END IF;

    FOREACH field IN ARRAY ARRAY['xp', 'current_hp', 'max_hp'] LOOP
        FOREACH value IN ARRAY ARRAY[NULL::integer, 0, 1, 8, 12, 300, 2147483647] LOOP
            IF field = 'max_hp' AND value = 0 THEN CONTINUE; END IF;
            EXECUTE format('UPDATE public.characters SET %I = $1', field) USING value;
            EXECUTE format('SELECT %I FROM public.characters LIMIT 1', field) INTO stored;
            IF stored IS DISTINCT FROM value THEN
                RAISE EXCEPTION '% did not retain %', field, value;
            END IF;
        END LOOP;
        FOREACH value IN ARRAY ARRAY[-1, -2147483648, 0] LOOP
            IF value = 0 AND field <> 'max_hp' THEN CONTINUE; END IF;
            BEGIN
                EXECUTE format('UPDATE public.characters SET %I = $1', field) USING value;
                RAISE EXCEPTION '% incorrectly accepted %', field, value;
            EXCEPTION WHEN check_violation THEN
                GET STACKED DIAGNOSTICS rejected_by = CONSTRAINT_NAME;
                IF rejected_by <> 'characters_' || field || '_check' THEN
                    RAISE EXCEPTION 'Unexpected constraint: %', rejected_by;
                END IF;
            END;
        END LOOP;
    END LOOP;
END;
$$;

-- No cross-field constraint: lowering max_hp below current_hp must work.
UPDATE public.characters SET current_hp = 8, max_hp = 12;
UPDATE public.characters SET max_hp = 1;
UPDATE public.characters SET xp = NULL, current_hp = NULL, max_hp = NULL;

ROLLBACK;
\echo 'XP/HP migration checks passed (rolled back)'
