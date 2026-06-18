BEGIN;

-- Create extension needed for gen_random_uuid (safe; will be no-op if already present)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create daily_photos table
CREATE TABLE IF NOT EXISTS public.daily_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_date date NOT NULL,
  photo_path text NOT NULL,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_photos_photo_date_unique UNIQUE (photo_date)
);

-- Indexes to speed lookups by date and creation time
CREATE INDEX IF NOT EXISTS idx_daily_photos_photo_date ON public.daily_photos (photo_date);
CREATE INDEX IF NOT EXISTS idx_daily_photos_created_at ON public.daily_photos (created_at);

COMMIT;
