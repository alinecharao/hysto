CREATE TABLE public.story_memories (
 user_id uuid NOT NULL DEFAULT auth.uid(),
 character_id uuid NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
 summary text NOT NULL DEFAULT '',
 source_ids uuid[] NOT NULL DEFAULT '{}',
 revision bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id, character_id)
);
GRANT SELECT, INSERT, UPDATE ON public.story_memories TO authenticated;
GRANT ALL ON public.story_memories TO service_role;
ALTER TABLE public.story_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own story memory" ON public.story_memories FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "insert own story memory" ON public.story_memories FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.characters c WHERE c.id = character_id AND (c.user_id IS NULL OR c.user_id = auth.uid())));
CREATE POLICY "update own story memory" ON public.story_memories FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE FUNCTION public.invalidate_story_memory() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 UPDATE public.story_memories SET summary = '', source_ids = '{}', revision = revision + 1, updated_at = now() WHERE user_id = OLD.user_id AND character_id = OLD.character_id;
 RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.invalidate_story_memory() FROM PUBLIC;
CREATE TRIGGER invalidate_memory_after_manual_delete AFTER DELETE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.invalidate_story_memory();