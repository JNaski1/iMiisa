BEGIN;

-- Add baby_id column to events
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS baby_id uuid;

-- Add FK for events.baby_id -> babies.id (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_events_baby_id'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT fk_events_baby_id
      FOREIGN KEY (baby_id)
      REFERENCES public.babies (id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_baby_id ON public.events (baby_id);
CREATE INDEX IF NOT EXISTS idx_events_baby_date_time ON public.events (baby_id, event_date, event_time);

-- Add baby_id column to daily_photos
ALTER TABLE public.daily_photos
  ADD COLUMN IF NOT EXISTS baby_id uuid;

-- Add FK for daily_photos.baby_id -> babies.id (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_daily_photos_baby_id'
  ) THEN
    ALTER TABLE public.daily_photos
      ADD CONSTRAINT fk_daily_photos_baby_id
      FOREIGN KEY (baby_id)
      REFERENCES public.babies (id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_daily_photos_baby_id ON public.daily_photos (baby_id);
CREATE INDEX IF NOT EXISTS idx_daily_photos_baby_photo_date ON public.daily_photos (baby_id, photo_date);

-- Existing design allowed only one photo globally per date.
-- Multi-baby requires one photo per baby per date.
ALTER TABLE public.daily_photos
  DROP CONSTRAINT IF EXISTS daily_photos_photo_date_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'daily_photos_baby_date_unique'
  ) THEN
    ALTER TABLE public.daily_photos
      ADD CONSTRAINT daily_photos_baby_date_unique
      UNIQUE (baby_id, photo_date);
  END IF;
END $$;

COMMIT;
