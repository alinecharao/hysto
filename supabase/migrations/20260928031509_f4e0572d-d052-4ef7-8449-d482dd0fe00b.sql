ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS opening_scene text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS background text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '';

UPDATE public.characters
SET description = CASE WHEN description = '' THEN tagline ELSE description END,
    opening_scene = CASE WHEN opening_scene = '' THEN greeting ELSE opening_scene END,
    background = CASE
      WHEN background = '' THEN trim(both E'\n' from concat_ws(E'\n\n',
        NULLIF(personality, ''),
        NULLIF(instructions, '')))
      ELSE background END;