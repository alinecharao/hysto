import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/characters/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Redirecionando — Persona" },
      { name: "description", content: "Abrindo o painel de histórias do Persona." },
      { property: "og:title", content: "Redirecionando — Persona" },
      { property: "og:description", content: "Abrindo o painel de histórias do Persona." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => null,
});