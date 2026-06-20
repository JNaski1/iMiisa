BEGIN;

-- Ensure test babies exist (idempotent) without touching existing event/photo history.
-- 1) Miisa with PIN 1306 (update PIN if Miisa already exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.babies WHERE name = 'Miisa') THEN
    UPDATE public.babies
    SET pin = '1306'
    WHERE name = 'Miisa';
  ELSE
    INSERT INTO public.babies (name, pin, birth_date)
    VALUES ('Miisa', '1306', '2026-06-13'::date);
  END IF;
END $$;

-- 2) Baby Burrito
INSERT INTO public.babies (name, pin, birth_date)
SELECT 'Baby Burrito', '1111', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.babies WHERE name = 'Baby Burrito'
);

-- 3) Lähderinne
INSERT INTO public.babies (name, pin, birth_date)
SELECT 'Lähderinne', '2222', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.babies WHERE name = 'Lähderinne'
);

COMMIT;
