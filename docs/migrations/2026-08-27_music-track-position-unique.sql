-- M7: Add composite unique constraint on (profile_id, position) for music_tracks.
-- This prevents duplicate positions within a profile's track list.
-- First deduplicate any existing positions (keep the earliest track per position).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY profile_id, position ORDER BY created_at ASC) AS rn
  FROM music_tracks
)
DELETE FROM music_tracks WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE music_tracks ADD CONSTRAINT uq_music_tracks_profile_position UNIQUE (profile_id, position);
