import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Persona — Converse com personagens de IA" },
      { name: "description", content: "Chat em texto com personagens de IA de personalidades únicas. Crie os seus." },
      { property: "og:title", content: "Persona — Converse com personagens de IA" },
      { property: "og:description", content: "Chat em texto com personagens de IA de personalidades únicas. Crie os seus." },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/characters", replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <div className="mb-6 text-5xl">🌙 🏴‍☠️ 🔍 🧙</div>
      <h1 className="font-display text-6xl italic text-primary md:text-7xl">Persona</h1>
      <p className="mt-4 max-w-md text-lg text-muted-foreground">
        Converse com personagens de IA, cada um com sua própria personalidade — ou crie os seus.
      </p>
      <Link to="/auth" className="mt-8 rounded-full bg-primary px-8 py-3 font-semibold text-primary-foreground hover:opacity-90">
        Começar
      </Link>
    </div>
  );
}
