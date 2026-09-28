import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ChevronLeft, Ellipsis, Info, Pencil, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import lunaPortrait from "@/assets/luna-portrait.jpg";
import rexPortrait from "@/assets/rex-portrait.jpg";
import helenaPortrait from "@/assets/helena-portrait.jpg";
import sherlockPortrait from "@/assets/sherlock-portrait.jpg";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

const presetPortraits: Record<string, string> = {
  "Luna Corvo": lunaPortrait,
  "Capitão Rex": rexPortrait,
  "Dra. Helena": helenaPortrait,
  Sherlock: sherlockPortrait,
};

function characterImage(character: Character) {
  return character.image_url || presetPortraits[character.name] || "";
}

function ChatPage() {
  const { id } = Route.useParams();
  const { data: character } = useSuspenseQuery(characterQuery(id));
  const { data: stored } = useSuspenseQuery(messagesQuery(id));
  return <ChatWindow key={id} character={character} stored={stored} />;
}

function Avatar({ character, className }: { character: Character; className: string }) {
  const image = characterImage(character);
  if (image) return <img src={image} alt={character.name} className={`${className} shrink-0 rounded-full object-cover`} />;
  return <span className={`${className} flex shrink-0 items-center justify-center rounded-full bg-secondary`}>{character.avatar}</span>;
}

function ChatWindow({ character, stored }: { character: Character; stored: { id: string; role: string; content: string }[] }) {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [showThoughts, setShowThoughts] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);
  const thoughtsRef = useRef(showThoughts);
  thoughtsRef.current = showThoughts;
  const image = characterImage(character);

  const initial = useMemo<UIMessage[]>(
    () => stored.map((m) => ({ id: m.id, role: m.role as "user" | "assistant", parts: [{ type: "text", text: m.content }] })),
    [stored],
  );
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/api/chat",
      headers: async (): Promise<Record<string, string>> => {
        const { data } = await supabase.auth.getSession();
        return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
      },
      prepareSendMessagesRequest: ({ messages, headers }) => {
        const last = messages[messages.length - 1];
        const text = (last?.parts ?? []).map((part) => (part.type === "text" ? part.text : "")).join("");
        return { ...(headers ? { headers } : {}), body: { characterId: character.id, text, thoughts: thoughtsRef.current } };
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

  async function clearHistory() {
    if (!confirm("Apagar toda a conversa com este personagem?")) return;
    const { error: deleteError } = await supabase.from("messages").delete().eq("character_id", character.id);
    if (deleteError) return alert(deleteError.message);
    setMessages([]);
    qc.invalidateQueries({ queryKey: ["messages", character.id] });
  }

  return (
    <TooltipProvider>
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
        {image && (
          <div className="pointer-events-none absolute inset-0 sm:hidden" aria-hidden="true">
            <img src={image} alt="" className="size-full object-cover" />
            <div className="absolute inset-0 bg-chat-overlay backdrop-blur-[2px]" />
          </div>
        )}

        <header className="relative z-20 grid h-16 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/50 bg-background/80 px-3 backdrop-blur-xl sm:h-auto sm:px-5 sm:py-3">
          <Button asChild variant="ghost" size="icon" className="shrink-0 rounded-full" aria-label="Voltar ao catálogo">
            <Link to="/characters"><ChevronLeft /></Link>
          </Button>
          <button type="button" onClick={() => setOpenInfo(true)} className="flex min-w-0 items-center justify-center gap-2 text-left" aria-label={`Abrir cartão de ${character.name}`}>
            <Avatar character={character} className="size-8 text-base" />
            <span className="truncate font-sans text-sm font-semibold">{character.name}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0 rounded-full" aria-label="Opções da conversa"><Ellipsis /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setOpenInfo(true)}><Info /> Ver personagem</DropdownMenuItem>
              {character.user_id === user.id && (
                <DropdownMenuItem asChild><Link to="/characters/$id/edit" params={{ id: character.id }}><Pencil /> Editar personagem</Link></DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => void clearHistory()} className="text-destructive"><Trash2 /> Limpar conversa</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <Conversation className="relative z-10 min-h-0">
          <ConversationContent className="mx-auto w-full max-w-3xl gap-5 px-4 pb-8 pt-6 sm:px-5 sm:py-8">
            {character.opening_scene && <Bubble role="assistant" text={character.opening_scene} character={character} showThoughts={showThoughts} />}
            {messages.map((message) => (
              <Bubble key={message.id} role={message.role} character={character} showThoughts={showThoughts} text={message.parts.map((part) => part.type === "text" ? part.text : "").join("")} />
            ))}
            {status === "submitted" && <Shimmer className="pl-2 text-sm">{`${character.name} está escrevendo...`}</Shimmer>}
            {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error.message || "Não foi possível obter resposta."}</p>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <footer className="relative z-20 shrink-0 border-t border-border/40 bg-background/85 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl sm:px-5 sm:py-4">
          <div className="mx-auto max-w-3xl space-y-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {SCENE_COMMANDS.map((command) => (
                <Button key={command.id} type="button" variant="outline" size="sm" disabled={busy} onClick={() => sendMessage({ text: commandMarker(command.id) })} className="shrink-0 rounded-full border-primary/35 bg-chat-glass text-xs">
                  <span>{command.icon}</span>{command.label}
                </Button>
              ))}
            </div>
            <PromptInput
              className="relative overflow-hidden rounded-full border-border bg-chat-glass shadow-lg"
              onSubmit={(message) => {
                const text = message.text.trim();
                if (!text || busy) return;
                setInput("");
                sendMessage({ text });
              }}
            >
              <PromptInputTextarea
                autoFocus
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Escreva sua mensagem..."
                className="max-h-32 min-h-12 py-3.5 pl-4 pr-14 text-base"
              />
              <PromptInputFooter className="absolute bottom-1 right-1 w-auto shrink-0 p-0">
                <PromptInputSubmit status={status} onStop={stop} disabled={!busy && !input.trim()} className="size-10 rounded-full bg-chat-action text-primary-foreground hover:bg-chat-action/90" />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </footer>

        <CharacterDialog character={character} open={openInfo} onOpenChange={setOpenInfo} showThoughts={showThoughts} onThoughtsChange={setShowThoughts} />
      </div>
    </TooltipProvider>
  );
}

function CharacterDialog({ character, open, onOpenChange, showThoughts, onThoughtsChange }: { character: Character; open: boolean; onOpenChange: (open: boolean) => void; showThoughts: boolean; onThoughtsChange: (value: boolean) => void }) {
  const image = characterImage(character);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-md gap-0 overflow-hidden rounded-lg border-border bg-background p-0">
        <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-secondary">
          {image ? <img src={image} alt={character.name} className="size-full object-cover object-top" /> : <div className="flex size-full items-center justify-center text-7xl">{character.avatar}</div>}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        </div>
        <div className="space-y-5 overflow-y-auto px-5 pb-6 pt-1">
          <div>
            <DialogTitle className="font-display text-3xl leading-tight">{character.name}</DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-relaxed text-foreground/80">{character.description}</DialogDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {character.gender && <span className="rounded-full bg-secondary px-3 py-1 text-xs">{character.gender}</span>}
            {character.tags.map((tag) => <span key={tag} className="rounded-full bg-secondary px-3 py-1 text-xs">{tag}</span>)}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-md bg-secondary px-4 py-3">
            <div className="min-w-0"><p className="text-sm font-medium">Pensamentos do personagem</p><p className="text-xs text-muted-foreground">Exibir emoções internas durante a história</p></div>
            <Switch checked={showThoughts} onCheckedChange={onThoughtsChange} aria-label="Mostrar pensamentos" />
          </div>
          {character.background && <div className="border-t border-border pt-4"><h3 className="mb-2 text-sm font-semibold">Sobre</h3><p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{character.background}</p></div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Bubble({ role, text, character, showThoughts }: { role: string; text: string; character: Character; showThoughts: boolean }) {
  if (role === "user") {
    const command = parseCommand(text);
    if (command) return <div className="flex justify-center"><span className="rounded-full border border-primary/40 bg-chat-glass px-4 py-1.5 text-xs text-primary">{command.icon} {command.label}</span></div>;
    return <Message from="user"><MessageContent className="rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground">{text}</MessageContent></Message>;
  }
  const { thought, body } = splitThought(text);
  return (
    <Message from="assistant" className="max-w-full">
      <MessageContent className="w-full gap-3 rounded-3xl border border-border/30 bg-chat-panel px-5 py-5 shadow-xl backdrop-blur-md sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
        {thought && showThoughts && <div className="border-l-2 border-primary/50 pl-3 text-sm italic text-muted-foreground">{thought}</div>}
        <MessageResponse className="prose-chat text-[17px] leading-[1.55] sm:text-[15px]">{body || (thought ? "" : text)}</MessageResponse>
      </MessageContent>
    </Message>
  );
}