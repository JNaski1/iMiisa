BEGIN;

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.babies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  pin text,
  birth_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_babies_name ON public.babies (name);
CREATE INDEX IF NOT EXISTS idx_babies_created_at ON public.babies (created_at);

COMMIT;
