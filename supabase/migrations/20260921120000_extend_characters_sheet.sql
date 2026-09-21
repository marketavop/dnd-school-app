-- First character-sheet fields; existing rows retain NULL in every new column.
ALTER TABLE public.characters
    ADD COLUMN portrait_path text NULL,
    ADD COLUMN race_code text NULL,
    ADD COLUMN class_code text NULL,
    ADD COLUMN level integer NULL,
    ADD COLUMN str integer NULL,
    ADD COLUMN dex integer NULL,
    ADD COLUMN con integer NULL,
    ADD COLUMN int integer NULL,
    ADD COLUMN wis integer NULL,
    ADD COLUMN cha integer NULL,
    ADD CONSTRAINT characters_level_check CHECK (level IS NULL OR level BETWEEN 1 AND 20),
    ADD CONSTRAINT characters_str_check CHECK (str IS NULL OR str BETWEEN 1 AND 20),
    ADD CONSTRAINT characters_dex_check CHECK (dex IS NULL OR dex BETWEEN 1 AND 20),
    ADD CONSTRAINT characters_con_check CHECK (con IS NULL OR con BETWEEN 1 AND 20),
    ADD CONSTRAINT characters_int_check CHECK (int IS NULL OR int BETWEEN 1 AND 20),
    ADD CONSTRAINT characters_wis_check CHECK (wis IS NULL OR wis BETWEEN 1 AND 20),
    ADD CONSTRAINT characters_cha_check CHECK (cha IS NULL OR cha BETWEEN 1 AND 20);
