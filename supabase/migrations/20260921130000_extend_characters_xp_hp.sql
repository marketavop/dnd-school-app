-- XP and HP remain unset until entered; existing rows retain NULL.
ALTER TABLE public.characters
    ADD COLUMN xp integer NULL,
    ADD COLUMN current_hp integer NULL,
    ADD COLUMN max_hp integer NULL,
    ADD CONSTRAINT characters_xp_check CHECK (xp IS NULL OR xp >= 0),
    ADD CONSTRAINT characters_current_hp_check CHECK (current_hp IS NULL OR current_hp >= 0),
    ADD CONSTRAINT characters_max_hp_check CHECK (max_hp IS NULL OR max_hp >= 1);
