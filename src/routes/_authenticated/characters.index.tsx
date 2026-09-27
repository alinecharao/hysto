import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { charactersQuery } from "@/lib/characters";

export const Route = createFileRoute("/_authenticated/characters/")({
  head: () => ({
    meta: [
      { title: "Personagens — Persona" },
      { name: "description", content: "Escolha um personagem de IA para conversar." },
      { property: "og:title", content: "Personagens — Persona" },
      { property: "og:description", content: "Escolha um personagem de IA para conversar." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(charactersQuery),
  component: Catalog,
});

function Catalog() {
  const { data } = useSuspenseQuery(charactersQuery);
  const { user } = Route.useRouteContext();
  const mine = data.filter((c) => c.user_id === user.id);
  const presets = data.filter((c) => !c.user_id);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl md:text-5xl">Com quem vamos conversar?</h1>
            <p className="mt-2 text-muted-foreground">Escolha um personagem ou crie o seu.</p>
          </div>
          <Link
            to="/characters/new"
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            + Criar personagem
          </Link>
        </div>

        {mine.length > 0 && <Section title="Seus personagens" items={mine} editable />}
        <Section title="Catálogo" items={presets} />
      </div>
    </div>
  );
}

function Section({
  title,
  items,
  editable,
}: {
  title: string;
  items: ReturnType<typeof useSuspenseQuery<typeof charactersQuery>>["data"] extends infer T ? T : never;
  editable?: boolean;
}) {
  return (
    <section className="mb-12">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <div
            key={c.id}
            className="group relative rounded-2xl border border-border bg-card p-5 transition hover:border-primary/60"
          >
            <Link to="/chat/$id" params={{ id: c.id }} className="absolute inset-0" aria-label={`Conversar com ${c.name}`} />
            <div className="flex items-start gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-3xl">
                {c.avatar}
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-xl">{c.name}</h3>
                <p className="text-sm text-muted-foreground">{c.tagline}</p>
              </div>
            </div>
            <p className="mt-4 line-clamp-2 text-sm text-foreground/80">{c.personality}</p>
            {editable && (
              <Link
                to="/characters/$id/edit"
                params={{ id: c.id }}
                className="relative mt-4 inline-block text-xs text-primary hover:underline"
              >
                Editar
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
