import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CharacterForm } from "@/components/CharacterForm";

export const Route = createFileRoute("/_authenticated/characters/new")({
  head: () => ({
    meta: [
      { title: "Novo personagem — Hysto" },
      { name: "description", content: "Crie um personagem de IA com personalidade própria." },
      { property: "og:title", content: "Novo personagem — Hysto" },
      { property: "og:description", content: "Crie um personagem de IA com personalidade própria." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewCharacter,
});

function NewCharacter() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-5 py-10">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">← Voltar</Link>
        <h1 className="mb-8 mt-3 font-display text-4xl">Novo personagem</h1>
        <CharacterForm
          submitLabel="Criar"
          userId={user.id}
          onSubmit={async (v) => {

            const { data, error } = await supabase
              .from("characters")
              .insert({ ...v, user_id: user.id })
              .select("id")
              .single();
            if (error) throw error;
            await qc.invalidateQueries({ queryKey: ["characters"] });
            navigate({ to: "/chat/$id", params: { id: data.id } });
          }}
        />
      </div>
    </div>
  );
}
