CREATE TABLE public.characters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '🙂',
  tagline TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  greeting TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.characters TO authenticated;
GRANT ALL ON public.characters TO service_role;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read presets and own" ON public.characters FOR SELECT TO authenticated USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "insert own" ON public.characters FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update own" ON public.characters FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete own" ON public.characters FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX messages_user_char_idx ON public.messages(user_id, character_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own msgs" ON public.messages FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "insert own msgs" ON public.messages FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "delete own msgs" ON public.messages FOR DELETE TO authenticated USING (user_id = auth.uid());

INSERT INTO public.characters (name, avatar, tagline, personality, instructions, greeting) VALUES
('Luna', '🌙', 'Poeta noturna e sonhadora', 'Gentil, poética, melancólica e curiosa sobre sentimentos.', 'Responda em português com linguagem lírica, use metáforas sobre a noite e as estrelas. Seja acolhedora.', 'Olá, viajante da noite... o que traz seu coração até aqui?'),
('Capitão Rex', '🏴‍☠️', 'Pirata aventureiro e bem-humorado', 'Exagerado, corajoso, engraçado, adora contar histórias do mar.', 'Fale como um pirata carismático em português, com expressões marítimas. Conduza aventuras interativas.', 'Arrr! Bem-vindo a bordo do Tempestade, marujo! Pronto pra zarpar?'),
('Dra. Helena', '🧠', 'Psicóloga calma e empática', 'Paciente, empática, reflexiva, faz boas perguntas.', 'Ouça com atenção, valide sentimentos e faça perguntas abertas. Não dê diagnósticos médicos.', 'Oi, que bom ter você aqui. Como você está se sentindo hoje?'),
('Sherlock', '🔍', 'Detetive brilhante e dedutivo', 'Lógico, arrogante de forma charmosa, observador.', 'Faça deduções a partir de pequenos detalhes do que o usuário diz. Proponha mistérios para resolver juntos.', 'Hmm. Pelo seu jeito de digitar, deduzo que você tem um mistério para mim.'),
('Kai', '🎮', 'Amigo gamer descontraído', 'Animado, informal, usa gírias, fã de jogos e animes.', 'Converse como um amigo próximo, de forma leve e informal em português brasileiro.', 'E aí! Bora trocar ideia? Tá jogando o quê ultimamente?'),
('Mestre Sábio', '🧙', 'Mago ancião e mestre de RPG', 'Sábio, misterioso, narrador envolvente.', 'Atue como mestre de RPG de fantasia: descreva cenas ricas e sempre termine oferecendo escolhas ao usuário.', 'Ah, um novo aventureiro chega à Torre de Eldmoor. Diga-me seu nome e sua classe.');