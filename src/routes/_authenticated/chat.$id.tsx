import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { characterQuery, messagesQuery, type Character } from "@/lib/characters";

export const Route = createFileRoute("/_authenticated/chat/$id")({
  head: () => ({
    meta: [
      { title: "Conversa — Persona" },
      { name: "description", content: "Converse em texto com seu personagem de IA." },
      { property: "og:title", content: "Conversa — Persona" },
      { property: "og:description", content: "Converse em texto com seu personagem de IA." },
    ],
  }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(characterQuery(params.id)),
      context.queryClient.fetchQuery(messagesQuery(params.id)),
    ]);
  },
  component: ChatPage,
});

function ChatPage() {
  const { id } = Route.useParams();
  const { data: character } = useSuspenseQuery(characterQuery(id));
  const { data: stored } = useSuspenseQuery(messagesQuery(id));
  return <ChatWindow key={id} character={character} stored={stored} />;
}

function ChatWindow({
  character,
  stored,
}: {
  character: Character;
  stored: { id: string; role: string; content: string }[];
}) {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const initial = useMemo<UIMessage[]>(
    () =>
      stored.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        parts: [{ type: "text", text: m.content }],
      })),
    [stored],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
        },
        prepareSendMessagesRequest: ({ messages, headers }) => {
          const last = messages[messages.length - 1];
          const text = last.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
          return { headers, body: { characterId: character.id, text } };
        },
      }),
    [character.id],
  );

  const { messages, sendMessage, status, error, setMessages, stop } = useChat({
    id: character.id,
    messages: initial,
    transport,
    onFinish: () => qc.invalidateQueries({ queryKey: ["messages", character.id] }),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  function send() {
    const t = input.trim();
    if (!t || busy) return;
    setInput("");
    sendMessage({ text: t });
  }

  async function clearHistory() {
    if (!confirm("Apagar toda a conversa com este personagem?")) return;
    const { error } = await supabase.from("messages").delete().eq("character_id", character.id);
    if (error) return alert(error.message);
    setMessages([]);
    qc.invalidateQueries({ queryKey: ["messages", character.id] });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
        <Link to="/characters" className="text-muted-foreground hover:text-foreground" aria-label="Voltar">←</Link>
        <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-2xl">{character.avatar}</div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg leading-tight">{character.name}</div>
          <div className="truncate text-xs text-muted-foreground">{character.tagline}</div>
        </div>
        {character.user_id === user.id && (
          <Link to="/characters/$id/edit" params={{ id: character.id }} className="text-xs text-muted-foreground hover:text-foreground">
            Editar
          </Link>
        )}
        <button onClick={clearHistory} className="text-xs text-muted-foreground hover:text-destructive">
          Limpar conversa
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 px-5 py-8">
          {character.greeting && <Bubble role="assistant" text={character.greeting} avatar={character.avatar} />}
          {messages.map((m) => (
            <Bubble
              key={m.id}
              role={m.role}
              avatar={character.avatar}
              text={m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
            />
          ))}
          {status === "submitted" && (
            <div className="flex items-center gap-3 text-muted-foreground">
              <span className="text-xl">{character.avatar}</span>
              <span className="flex gap-1">
                <span className="size-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                <span className="size-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                <span className="size-2 animate-bounce rounded-full bg-primary" />
              </span>
            </div>
          )}
          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error.message || "Não foi possível obter resposta."}
            </p>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-border px-5 py-4">
        <form
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-input bg-card p-2 focus-within:border-primary"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            ref={inputRef}
            autoFocus
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Mensagem para ${character.name}...`}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
          />
          {busy ? (
            <button type="button" onClick={stop} className="size-10 shrink-0 rounded-xl bg-secondary text-sm">■</button>
          ) : (
            <button disabled={!input.trim()} className="size-10 shrink-0 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-40">↑</button>
          )}
        </form>
      </div>
    </div>
  );
}

function Bubble({ role, text, avatar }: { role: string; text: string; avatar: string }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-xl">{avatar}</span>
      <div className="prose-chat min-w-0 flex-1 text-[15px] leading-relaxed">
        <ReactMarkdown>{text}</ReactMarkdown>
      </div>
    </div>
  );
}
