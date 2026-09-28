BEGIN;

-- Keep nullable HP and the existing current_hp >= 0 check. Validating the
-- constraints scans existing rows; any invalid legacy row rolls this migration
-- back rather than silently rewriting game data.
ALTER TABLE public.characters
  DROP CONSTRAINT characters_max_hp_check,
  ADD CONSTRAINT characters_max_hp_check CHECK (max_hp IS NULL OR max_hp >= 0),
  ADD CONSTRAINT characters_hp_bounds_check CHECK (
    current_hp IS NULL OR max_hp IS NULL OR current_hp <= max_hp
  );

-- player_update_character already lowers current_hp in the very same UPDATE
-- that lowers max_hp. CHECK sees that final row, with row-level write locking;
-- no separate read/check/write or duplicate RPC validation is necessary.
COMMIT;
