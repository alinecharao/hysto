import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CharacterForm } from "@/components/CharacterForm";
import { characterQuery } from "@/lib/characters";

export const Route = createFileRoute("/_authenticated/characters/$id/edit")({
  head: () => ({
    meta: [
      { title: "Editar personagem — Hysto" },
      { name: "description", content: "Ajuste a personalidade e as instruções do personagem." },
      { property: "og:title", content: "Editar personagem — Hysto" },
      { property: "og:description", content: "Ajuste a personalidade e as instruções do personagem." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(characterQuery(params.id)),
  component: EditCharacter,
});

function EditCharacter() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(characterQuery(id));
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-5 py-10">
        <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">← Voltar</Link>
        <h1 className="mb-8 mt-3 font-display text-4xl">Editar {data.name}</h1>
        <CharacterForm
          initial={data}
          submitLabel="Salvar"
          userId={user.id}

          onSubmit={async (v) => {
            const { error } = await supabase.from("characters").update(v).eq("id", id);
            if (error) throw error;
            await qc.invalidateQueries({ queryKey: ["characters"] });
            await qc.invalidateQueries({ queryKey: ["character", id] });
            navigate({ to: "/chat/$id", params: { id } });
          }}
          onDelete={async () => {
            const { error } = await supabase.from("characters").delete().eq("id", id);
            if (error) return alert(error.message);
            await qc.invalidateQueries({ queryKey: ["characters"] });
            navigate({ to: "/dashboard" });
          }}
        />
      </div>
    </div>
  );
}
