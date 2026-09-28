import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "Persona — Converse com personagens de IA" },
      { name: "description", content: "Chat em texto com personagens de IA de personalidades únicas. Crie os seus." },
      { property: "og:title", content: "Persona — Converse com personagens de IA" },
      { property: "og:description", content: "Chat em texto com personagens de IA de personalidades únicas. Crie os seus." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => null,
});
