import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/characters/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Redirecionando — Hysto" },
      { name: "description", content: "Abrindo o painel de histórias do Hysto." },
      { property: "og:title", content: "Redirecionando — Hysto" },
      { property: "og:description", content: "Abrindo o painel de histórias do Hysto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => null,
});