-- Run against an EMPTY disposable PostgreSQL database, never production:
-- psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/characters-migration.sql
-- The fixture models the documented baseline; all changes are rolled back.
\set ON_ERROR_STOP on
BEGIN;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.characters (
    id uuid PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    name text NOT NULL
);
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO public.characters VALUES
    ('00000000-0000-0000-0000-000000000002',
     '00000000-0000-0000-0000-000000000001', 'Existing character');
CREATE TEMP TABLE characters_before AS SELECT * FROM public.characters;

\ir ../supabase/migrations/20260921120000_extend_characters_sheet.sql

DO $$
DECLARE
    field text;
    value integer;
    stored integer;
    rejected_by text;
BEGIN
    IF EXISTS (
        (SELECT id, user_id, name FROM public.characters EXCEPT TABLE characters_before)
        UNION ALL
        (TABLE characters_before EXCEPT SELECT id, user_id, name FROM public.characters)
    ) THEN
        RAISE EXCEPTION 'Migration changed existing character identity';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.characters
        WHERE portrait_path IS NOT NULL OR race_code IS NOT NULL OR class_code IS NOT NULL
           OR level IS NOT NULL OR str IS NOT NULL OR dex IS NOT NULL OR con IS NOT NULL
           OR int IS NOT NULL OR wis IS NOT NULL OR cha IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'New fields must initially be NULL';
    END IF;

    FOREACH field IN ARRAY ARRAY['level', 'str', 'dex', 'con', 'int', 'wis', 'cha'] LOOP
        FOREACH value IN ARRAY ARRAY[1, 15, 20, NULL::integer] LOOP
            -- %s deliberately leaves these fixed identifiers unquoted, including int.
            EXECUTE format('UPDATE public.characters SET %s = $1', field) USING value;
            EXECUTE format('SELECT %s FROM public.characters', field) INTO stored;
            IF stored IS DISTINCT FROM value THEN
                RAISE EXCEPTION '% did not retain %', field, value;
            END IF;
        END LOOP;
        FOREACH value IN ARRAY ARRAY[-1, 0, 21, 2147483647] LOOP
            BEGIN
                EXECUTE format('UPDATE public.characters SET %s = $1', field) USING value;
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

-- A second character for the same account remains allowed, new fields omitted.
INSERT INTO public.characters (id, user_id, name) VALUES
    ('00000000-0000-0000-0000-000000000003',
     '00000000-0000-0000-0000-000000000001', 'Second character');
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000001';
DO $$
BEGIN
    IF (SELECT count(*) FROM public.characters) <> 2
       OR EXISTS (SELECT 1 FROM public.characters WHERE user_id IS NOT NULL) THEN
        RAISE EXCEPTION 'ON DELETE SET NULL was not preserved';
    END IF;
END;
$$;

ROLLBACK;
\echo 'characters migration checks passed (rolled back)'
