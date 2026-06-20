BEGIN;

-- Create one default baby profile for existing single-baby Miisa data
-- If the exact Miisa profile already exists, reuse it.
WITH existing AS (
  SELECT id
  FROM public.babies
  WHERE name = 'Miisa'
    AND pin = 'm1306'
    AND birth_date = '2026-06-13'::date
  LIMIT 1
),
inserted AS (
  INSERT INTO public.babies (name, pin, birth_date)
  SELECT
    'Miisa'::text,
    'm1306'::text,
    '2026-06-13'::date
  WHERE NOT EXISTS (SELECT 1 FROM existing)
  RETURNING id
),
target AS (
  SELECT id FROM existing
  UNION ALL
  SELECT id FROM inserted
  LIMIT 1
)
UPDATE public.events e
SET baby_id = (SELECT id FROM target)
WHERE e.baby_id IS NULL;

WITH existing AS (
  SELECT id
  FROM public.babies
  WHERE name = 'Miisa'
    AND pin = 'm1306'
    AND birth_date = '2026-06-13'::date
  LIMIT 1
),
inserted AS (
  INSERT INTO public.babies (name, pin, birth_date)
  SELECT
    'Miisa'::text,
    'm1306'::text,
    '2026-06-13'::date
  WHERE NOT EXISTS (SELECT 1 FROM existing)
  RETURNING id
),
target AS (
  SELECT id FROM existing
  UNION ALL
  SELECT id FROM inserted
  LIMIT 1
)
UPDATE public.daily_photos p
SET baby_id = (SELECT id FROM target)
WHERE p.baby_id IS NULL;

-- Enforce requirement: every event and photo must belong to a baby
ALTER TABLE public.events
  ALTER COLUMN baby_id SET NOT NULL;

ALTER TABLE public.daily_photos
  ALTER COLUMN baby_id SET NOT NULL;

COMMIT;
