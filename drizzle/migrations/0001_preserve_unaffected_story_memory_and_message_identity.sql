ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS client_message_id text;
CREATE UNIQUE INDEX IF NOT EXISTS messages_client_identity ON public.messages (user_id, character_id, client_message_id) WHERE client_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_story_chronology ON public.messages (user_id, character_id, created_at, id);
CREATE OR REPLACE FUNCTION public.invalidate_story_memory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 UPDATE public.story_memories SET summary = '', source_ids = '{}', revision = revision + 1, updated_at = now()
 WHERE user_id = OLD.user_id AND character_id = OLD.character_id AND OLD.id = ANY(source_ids);
 RETURN OLD;
END;
$function$;