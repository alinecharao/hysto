import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import {
  characterQuery,
  messagesQuery,
  parseCommand,
  splitThought,
  commandMarker,
  SCENE_COMMANDS,
  type Character,
} from "@/lib/characters";

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

function Avatar({ character, className }: { character: Character; className: string }) {
  if (character.image_url) {
    return (
      <img
        src={character.image_url}
        alt={character.name}
        className={`${className} shrink-0 overflow-hidden rounded-xl object-cover`}
      />
    );
  }
  return (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-xl bg-secondary`}>
      {character.avatar}
    </span>
  );
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
  const [showThoughts, setShowThoughts] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);
  const thoughtsRef = useRef(showThoughts);
  thoughtsRef.current = showThoughts;
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
          const text = (last?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join("");
          return {
            ...(headers ? { headers } : {}),
            body: { characterId: character.id, text, thoughts: thoughtsRef.current },
          };
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
    const { error: delErr } = await supabase.from("messages").delete().eq("character_id", character.id);
    if (delErr) return alert(delErr.message);
    setMessages([]);
    qc.invalidateQueries({ queryKey: ["messages", character.id] });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border">
        <div className="flex items-center gap-3 px-5 py-3">
          <Link to="/characters" className="text-muted-foreground hover:text-foreground" aria-label="Voltar">
            ←
          </Link>
          <Avatar character={character} className="size-11 text-2xl" />
          <button
            onClick={() => setOpenInfo((o) => !o)}
            className="min-w-0 flex-1 text-left"
            title="Ver descrição"
          >
            <div className="flex items-center gap-2">
              <span className="font-display text-lg leading-tight">{character.name}</span>
              {character.gender && (
                <span className="text-xs text-muted-foreground">· {character.gender}</span>
              )}
              <span className="text-xs text-muted-foreground">{openInfo ? "▲" : "▼"}</span>
            </div>
            {character.tags?.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {character.tags.map((t) => (
                  <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wide">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <span>Pensamentos</span>
            <input
              type="checkbox"
              checked={showThoughts}
              onChange={(e) => setShowThoughts(e.target.checked)}
              className="peer sr-only"
            />
            <span className="relative h-5 w-9 rounded-full bg-secondary transition peer-checked:bg-primary">
              <span
                className={`absolute top-0.5 size-4 rounded-full bg-background transition-all ${showThoughts ? "left-[1.125rem]" : "left-0.5"}`}
              />
            </span>
          </label>
          {character.user_id === user.id && (
            <Link
              to="/characters/$id/edit"
              params={{ id: character.id }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Editar
            </Link>
          )}
          <button onClick={clearHistory} className="text-xs text-muted-foreground hover:text-destructive">
            Limpar conversa
          </button>
        </div>
        {openInfo && character.description && (
          <p className="whitespace-pre-wrap border-t border-border bg-card px-5 py-4 text-sm text-foreground/80">
            {character.description}
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 px-5 py-8">
          {character.opening_scene && (
            <Bubble role="assistant" text={character.opening_scene} character={character} showThoughts={showThoughts} />
          )}
          {messages.map((m) => (
            <Bubble
              key={m.id}
              role={m.role}
              character={character}
              showThoughts={showThoughts}
              text={m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
            />
          ))}
          {status === "submitted" && (
            <div className="flex items-center gap-3 text-muted-foreground">
              <Avatar character={character} className="size-7 text-lg" />
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
        <div className="mx-auto max-w-3xl space-y-2">
          <div className="flex flex-wrap gap-2">
            {SCENE_COMMANDS.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={busy}
                onClick={() => sendMessage({ text: commandMarker(c.id) })}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary hover:text-foreground disabled:opacity-40"
              >
                {c.icon} {c.label}
              </button>
            ))}
          </div>
          <form
            className="flex items-end gap-2 rounded-2xl border border-input bg-card p-2 focus-within:border-primary"
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
              <button type="button" onClick={stop} className="size-10 shrink-0 rounded-xl bg-secondary text-sm">
                ■
              </button>
            ) : (
              <button
                disabled={!input.trim()}
                className="size-10 shrink-0 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-40"
              >
                ↑
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

function Bubble({
  role,
  text,
  character,
  showThoughts,
}: {
  role: string;
  text: string;
  character: Character;
  showThoughts: boolean;
}) {
  if (role === "user") {
    const cmd = parseCommand(text);
    if (cmd) {
      return (
        <div className="flex justify-center">
          <span className="rounded-full border border-primary/40 bg-primary/10 px-4 py-1 text-xs text-primary">
            {cmd.icon} {cmd.label}
          </span>
        </div>
      );
    }
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {text}
        </div>
      </div>
    );
  }
  const { thought, body } = splitThought(text);
  return (
    <div className="flex gap-3">
      <Avatar character={character} className="mt-0.5 size-8 text-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        {thought && showThoughts && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm italic text-primary/90">
            💭 {thought}
          </div>
        )}
        <div className="prose-chat text-[15px] leading-relaxed">
          <ReactMarkdown>{body || (thought ? "" : text)}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
