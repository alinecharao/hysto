import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Layout,
});

function Layout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const isChat = useRouterState({ select: (state) => state.location.pathname.startsWith("/chat/") });
  const { queryClient } = Route.useRouteContext();
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="flex h-[100dvh] flex-col pt-[max(env(safe-area-inset-top),48px)] sm:pt-0">
      <header className={`${isChat ? "hidden sm:flex" : "flex"} shrink-0 items-center justify-between border-b border-border px-5 py-3`}>
        <Link to="/dashboard" className="font-display text-xl italic text-primary">
          Persona
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="hidden text-muted-foreground sm:inline">{user.email}</span>
          <Button type="button" variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
            Sair
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
