import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Compass, Plus, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import lunaPortrait from "@/assets/luna-portrait.jpg";
import rexPortrait from "@/assets/rex-portrait.jpg";
import helenaPortrait from "@/assets/helena-portrait.jpg";
import sherlockPortrait from "@/assets/sherlock-portrait.jpg";
import { Button } from "@/components/ui/button";
import { charactersQuery, type Character } from "@/lib/characters";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Histórias — Hysto" },
      { name: "description", content: "Acesse todas as suas histórias e personagens de IA." },
      { property: "og:title", content: "Histórias — Hysto" },
      { property: "og:description", content: "Acesse todas as suas histórias e personagens de IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  const [activeTab, setActiveTab] = useState<"all" | "mine" | "recent">("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const featured = mine[0];
  const visible = useMemo(() => {
    const selected = activeTab === "mine" ? mine : activeTab === "recent" ? data.slice(0, 6) : [...mine, ...presets];
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return selected;
    return selected.filter((character) => [character.name, character.description, character.gender, ...character.tags].join(" ").toLocaleLowerCase("pt-BR").includes(query));
  }, [activeTab, data, mine, presets, search]);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-6xl px-3 pb-10 pt-5 sm:px-6 sm:pt-8">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-1">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-primary">Descubra sua próxima história</p>
            <h1 className="truncate font-display text-3xl sm:text-4xl">Personagens</h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label="Buscar personagens" aria-expanded={searchOpen} onClick={() => setSearchOpen((open) => !open)}>
              <Search />
            </Button>
            <Button asChild size="icon" className="rounded-full" aria-label="Criar personagem">
              <Link to="/characters/new"><Plus /></Link>
            </Button>
          </div>
        </div>

        {searchOpen && (
          <div className="mt-4 px-1">
            <label className="relative block">
              <span className="sr-only">Buscar por nome, gênero ou tema</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar personagens" className="h-11 w-full rounded-md border border-input bg-card pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-1 focus:ring-primary" />
            </label>
          </div>
        )}

        {featured && (
          <section className="mt-7">
            <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1">
              <h2 className="truncate text-sm font-semibold">Continue sua história</h2>
              <span className="text-xs text-muted-foreground">Seus personagens</span>
            </div>
            <Link
              to="/chat/$id"
              params={{ id: featured.id }}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-lg border border-border bg-card p-2 transition-colors hover:border-primary/60"
            >
              <CharacterImage character={featured} className="aspect-square size-[5.5rem] rounded-md" />
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{featured.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{featured.opening_scene || featured.description}</p>
              </div>
              <span className="pr-2 text-xl text-primary" aria-hidden="true">→</span>
            </Link>
          </section>
        )}

        <nav className="mt-8 flex gap-6 overflow-x-auto border-b border-border px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Filtros do catálogo">
          <Tab active={activeTab === "all"} onClick={() => setActiveTab("all")}>Para você</Tab>
          <Tab active={activeTab === "mine"} onClick={() => setActiveTab("mine")}>Seus personagens</Tab>
          <Tab active={activeTab === "recent"} onClick={() => setActiveTab("recent")}>Mais recentes</Tab>
        </nav>

        {visible.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {visible.map((character) => <CharacterCard key={character.id} character={character} editable={character.user_id === user.id} />)}
          </div>
        ) : (
          <div className="grid min-h-64 place-items-center text-center">
            <div><Compass className="mx-auto mb-3 size-7 text-primary" /><p className="text-sm text-muted-foreground">Você ainda não criou personagens.</p></div>
          </div>
        )}
      </div>
    </div>
  );
}

const presetPortraits: Record<string, string> = {
  "Luna Corvo": lunaPortrait,
  "Capitão Rex": rexPortrait,
  "Dra. Helena": helenaPortrait,
  Sherlock: sherlockPortrait,
};

function CharacterImage({ character, className }: { character: Character; className: string }) {
  const image = character.image_url || presetPortraits[character.name];
  if (image) return <img src={image} alt={character.name} className={`${className} object-cover object-top`} />;
  return <div className={`${className} grid place-items-center bg-secondary text-5xl`}>{character.avatar}</div>;
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <Button type="button" variant="ghost" onClick={onClick} className={`relative h-11 shrink-0 rounded-none px-0 text-sm ${active ? "text-foreground" : "text-muted-foreground"}`}>
      {children}
      {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />}
    </Button>
  );
}

function CharacterCard({ character, editable }: { character: Character; editable: boolean }) {
  return (
    <article className="group relative aspect-[3/4] min-w-0 overflow-hidden rounded-md bg-card">
      <CharacterImage character={character} className="absolute inset-0 size-full transition duration-500 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/15 to-transparent" />
      <Link to="/chat/$id" params={{ id: character.id }} className="absolute inset-0" aria-label={`Abrir ${character.name}`} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase text-primary">
          <Sparkles className="size-3" /> {character.tags[0] || character.gender || "História"}
        </div>
        <h2 className="truncate text-base font-bold sm:text-lg">{character.name}</h2>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground/75 sm:text-sm">{character.description}</p>
        {editable && <span className="mt-2 inline-block text-[10px] font-semibold uppercase text-primary">Criado por você</span>}
      </div>
    </article>
  );
}
