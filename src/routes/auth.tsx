import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Persona" },
      { name: "description", content: "Entre para conversar com seus personagens de IA." },
      { property: "og:title", content: "Entrar — Persona" },
      { property: "og:description", content: "Entre para conversar com seus personagens de IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/dashboard", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setMsg(error.message);
      else if (!data.session) setMsg("Confira seu e-mail para confirmar a conta.");
    }
    setBusy(false);
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/auth` });
    if (r.error) setMsg(r.error.message);
  }

  const field = "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <h1 className="text-center font-display text-5xl italic text-primary">Persona</h1>
        <p className="mb-8 mt-2 text-center text-sm text-muted-foreground">
          {mode === "in" ? "Entre para continuar suas conversas" : "Crie sua conta"}
        </p>
        <button onClick={google} className="mb-4 w-full rounded-lg border border-border bg-card py-2.5 text-sm font-medium hover:border-primary">
          Continuar com Google
        </button>
        <div className="mb-4 text-center text-xs text-muted-foreground">ou</div>
        <form onSubmit={submit} className="space-y-3">
          <input type="email" required placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          <input type="password" required minLength={6} placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
          <button disabled={busy} className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {mode === "in" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground">
          {mode === "in" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
        </button>
      </div>
    </div>
  );
}
