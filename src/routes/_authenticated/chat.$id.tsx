import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  Brain,
  ChevronLeft,
  Ellipsis,
  Info,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  parseNarrativeSegments,
  commandMarker,
  SCENE_COMMANDS,
  type Character,
} from "@/lib/characters";

export const Route = createFileRoute("/_authenticated/chat/$id")({
  head: () => ({
    meta: [
      { title: "Conversa — Hysto" },
      { name: "description", content: "Converse em texto com seu personagem de IA." },
      { property: "og:title", content: "Conversa — Hysto" },
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

type AiProvider = "auto" | "gemini" | "groq" | "openrouter" | "kimi" | "openai";

const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  auto: "Automático",
  gemini: "Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  kimi: "Kimi",
  openai: "OpenAI",
};

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
  if (image)
    return (
      <img
        src={image}
        alt={character.name}
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    );
  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-secondary`}
    >
      {character.avatar}
    </span>
  );
}

type StoredMessage = { id: string; role: string; content: string; created_at: string };

function ChatWindow({ character, stored }: { character: Character; stored: StoredMessage[] }) {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [showThoughts, setShowThoughts] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProvider>("auto");
  const [errorHidden, setErrorHidden] = useState(false);
  const replacementRef = useRef<UIMessage | null>(null);
  const cancelledSavedRef = useRef<string | null>(null);
  const thoughtsRef = useRef(showThoughts);
  const aiProviderRef = useRef<AiProvider>(aiProvider);
  thoughtsRef.current = showThoughts;
  aiProviderRef.current = aiProvider;

  useEffect(() => {
    const saved = window.localStorage.getItem("hysto-ai-provider");
    if (
      saved === "auto" ||
      saved === "gemini" ||
      saved === "groq" ||
      saved === "openrouter" ||
      saved === "kimi" ||
      saved === "openai"
    ) {
      setAiProvider(saved);
    }
  }, []);

  const changeAiProvider = (value: AiProvider) => {
    setAiProvider(value);
    window.localStorage.setItem("hysto-ai-provider", value);
  };
  const image = characterImage(character);

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
        prepareSendMessagesRequest: ({ messages, headers, trigger }) => {
          const last = [...messages].reverse().find((message) => message.role === "user");
          const text = (last?.parts ?? [])
            .map((part) => (part.type === "text" ? part.text : ""))
            .join("");
          return {
            ...(headers ? { headers } : {}),
            body: {
              characterId: character.id,
              userMessageId: last?.id,
              text,
              thoughts: thoughtsRef.current,
              provider: aiProviderRef.current,
              regenerate: trigger === "regenerate-message",
            },
          };
        },
      }),
    [character.id],
  );
  const { messages, sendMessage, regenerate, status, error, setMessages, stop } = useChat({
    id: character.id,
    messages: initial,
    generateId: () => crypto.randomUUID(),
    transport,
    onError: () => {
      const replacement = replacementRef.current;
      replacementRef.current = null;
      if (replacement) setMessages((current) => current.some((m) => m.id === replacement.id) ? current : [...current, replacement]);
    },
    onFinish: async ({ message, isAbort, isDisconnect, isError }) => {
      const partial = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
      if ((isAbort || isDisconnect) && partial.trim() && cancelledSavedRef.current !== message.id) {
        cancelledSavedRef.current = message.id;
        const { error: saveError } = await supabase.from("messages").upsert({
          id: message.id, user_id: user.id, character_id: character.id, role: "assistant", content: partial,
        }, { onConflict: "id", ignoreDuplicates: true });
        if (saveError) alert("Não foi possível salvar a resposta interrompida. Mantenha esta conversa aberta.");
      }
      const replacement = replacementRef.current;
      replacementRef.current = null;
      if (replacement && !isAbort && !isDisconnect && !isError && partial.trim()) {
        // Replace only after confirming the new response is safely persisted.
        const { data: saved } = await supabase.from("messages").select("id").eq("id", message.id).maybeSingle();
        if (saved) await removeMessageAndFollowing(replacement);
      } else if (replacement) {
        setMessages((current) => current.some((m) => m.id === replacement.id) ? current : [...current, replacement]);
      }
      await qc.invalidateQueries({ queryKey: ["messages", character.id] });
    },
  });

  useEffect(() => {
    if (error) setErrorHidden(false);
  }, [error]);

  const busy = status === "submitted" || status === "streaming";

  async function stopAndSave() {
    const latest = messages.at(-1);
    await stop();
    if (!latest || latest.role !== "assistant") return;
    const content = latest.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
    if (!content.trim()) return;
    const { error: saveError } = await supabase.from("messages").upsert({
      id: latest.id, user_id: user.id, character_id: character.id, role: "assistant", content,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (saveError) alert("Não foi possível salvar a resposta interrompida. Mantenha esta conversa aberta.");
    await qc.invalidateQueries({ queryKey: ["messages", character.id] });
  }

  async function clearHistory() {
    if (!confirm("Apagar toda a conversa com este personagem?")) return;
    const { error: deleteError } = await supabase
      .from("messages")
      .delete()
      .eq("character_id", character.id);
    if (deleteError) return alert(deleteError.message);
    setMessages([]);
    qc.invalidateQueries({ queryKey: ["messages", character.id] });
  }

  async function removeMessageAndFollowing(message: UIMessage) {
    // Find the exact saved row (by id, or newest row with the same text).
    const { data: byId } = await supabase
      .from("messages")
      .select("id, created_at")
      .eq("character_id", character.id)
      .eq("id", message.id)
      .maybeSingle();

    const target = byId;
    if (!target) return;

    // Only the chosen message is removed — never anything else.
    const { error: deleteError } = await supabase.from("messages").delete().eq("id", target.id);
    if (deleteError) throw deleteError;
  }

  async function deleteMessage(message: UIMessage, index: number) {
    if (!confirm("Apagar esta mensagem?")) return;

    try {
      await removeMessageAndFollowing(message);
      setMessages((current) => current.filter((_, i) => i !== index));
      setErrorHidden(true);
      await qc.invalidateQueries({ queryKey: ["messages", character.id] });
    } catch (deleteError) {
      alert(
        deleteError instanceof Error ? deleteError.message : "Não foi possível apagar a mensagem.",
      );
    }
  }

  async function regenerateMessage(message: UIMessage, index: number) {
    if (busy || !confirm("Substituir esta resposta por uma nova?")) return;

    try {
      replacementRef.current = message;
      setErrorHidden(true);
      await regenerate({ messageId: message.id });
    } catch (regenerateError) {
      replacementRef.current = null;
      setMessages((current) => current.some((m) => m.id === message.id) ? current : [...current, message]);
      alert(
        regenerateError instanceof Error
          ? regenerateError.message
          : "Não foi possível gerar uma nova resposta.",
      );
    }
  }

  function messageText(message: UIMessage) {
    return (message.parts ?? []).map((part) => (part.type === "text" ? part.text : "")).join("");
  }

  function lastUserMessage() {
    return [...messages].reverse().find((message) => message.role === "user") ?? null;
  }

  async function deleteFailedMessage() {
    const message = lastUserMessage();
    if (!message) {
      setErrorHidden(true);
      return;
    }

    try {
      if (!confirm("Apagar esta mensagem?")) return;
      await removeMessageAndFollowing(message);
      setMessages((current) => current.filter((m) => m.id !== message.id));
      setErrorHidden(true);
      await qc.invalidateQueries({ queryKey: ["messages", character.id] });
    } catch (deleteError) {
      alert(
        deleteError instanceof Error ? deleteError.message : "Não foi possível apagar a mensagem.",
      );
    }
  }

  async function retryFailedMessage() {
    const message = lastUserMessage();
    if (!message || busy) return;

    const text = messageText(message).trim();
    if (!text) return;

    try {
      setErrorHidden(true);
      await regenerate({ messageId: message.id });
    } catch (retryError) {
      alert(
        retryError instanceof Error ? retryError.message : "Não foi possível reenviar a mensagem.",
      );
    }
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
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-full"
            aria-label="Voltar ao catálogo"
          >
            <Link to="/dashboard">
              <ChevronLeft />
            </Link>
          </Button>
          <button
            type="button"
            onClick={() => setOpenInfo(true)}
            className="flex min-w-0 items-center justify-center gap-2 text-left"
            aria-label={`Abrir cartão de ${character.name}`}
          >
            <Avatar character={character} className="size-8 text-base" />
            <span className="truncate font-sans text-sm font-semibold">{character.name}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-full"
                aria-label="Opções da conversa"
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setOpenInfo(true)}>
                <Info /> Ver personagem
              </DropdownMenuItem>
              {character.user_id === user.id && (
                <DropdownMenuItem asChild>
                  <Link to="/characters/$id/edit" params={{ id: character.id }}>
                    <Pencil /> Editar personagem
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => void clearHistory()} className="text-destructive">
                <Trash2 /> Limpar conversa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <Conversation className="relative z-10 min-h-0">
          <ConversationContent className="mx-auto w-full max-w-3xl gap-5 px-4 pb-8 pt-6 sm:px-5 sm:py-8">
            {character.opening_scene && (
              <Bubble
                role="assistant"
                text={character.opening_scene}
                character={character}
                showThoughts={showThoughts}
              />
            )}
            {messages.map((message, index) => (
              <Bubble
                key={message.id}
                role={message.role}
                character={character}
                showThoughts={showThoughts}
                text={messageText(message)}
                busy={busy}
                onDelete={() => void deleteMessage(message, index)}
                {...(message.role === "assistant" && index === messages.length - 1
                  ? { onRegenerate: () => void regenerateMessage(message, index) }
                  : {})}
              />
            ))}
            {status === "submitted" && (
              <Shimmer className="pl-2 text-sm">{`${character.name} está escrevendo...`}</Shimmer>
            )}
            {error && !errorHidden && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <p>{error.message || "Não foi possível obter resposta."}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void retryFailedMessage()}
                    className="h-8 rounded-full border-destructive/30 bg-background/60 text-xs text-foreground"
                  >
                    <RotateCcw className="size-3.5" />
                    Tentar novamente
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void deleteFailedMessage()}
                    className="h-8 rounded-full text-xs text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    Apagar mensagem
                  </Button>
                </div>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <footer className="relative z-20 shrink-0 border-t border-border/40 bg-background/85 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-5 sm:py-4">
          <div className="mx-auto max-w-3xl space-y-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Select
                value={aiProvider}
                onValueChange={(value) => changeAiProvider(value as AiProvider)}
              >
                <SelectTrigger className="h-8 w-[138px] shrink-0 rounded-full border-primary/35 bg-chat-glass px-3 text-xs">
                  <span className="mr-1">✨</span>
                  <SelectValue>{AI_PROVIDER_LABELS[aiProvider]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">✨ Automático</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="groq">Groq</SelectItem>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                  <SelectItem value="kimi">Kimi</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                </SelectContent>
              </Select>
              {SCENE_COMMANDS.map((command) => (
                <Button
                  key={command.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => sendMessage({ text: commandMarker(command.id) })}
                  className="shrink-0 rounded-full border-primary/35 bg-chat-glass text-xs"
                >
                  <span>{command.icon}</span>
                  {command.label}
                </Button>
              ))}
            </div>
            <PromptInput
              className="relative rounded-3xl border-border bg-chat-glass shadow-lg"
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
                className="min-h-14 max-h-36 overflow-y-auto py-4 pl-4 pr-16 text-base leading-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              />
              <PromptInputFooter className="absolute bottom-1 right-1 w-auto justify-end p-0">
              <PromptInputSubmit
                status={status}
                onStop={stopAndSave}
                disabled={!busy && !input.trim()}
                className="size-10 shrink-0 self-center rounded-full bg-chat-action text-primary-foreground hover:bg-chat-action/90"
              />
              </PromptInputFooter>
            </PromptInput>
          </div>
        </footer>

        <CharacterDialog
          character={character}
          open={openInfo}
          onOpenChange={setOpenInfo}
          showThoughts={showThoughts}
          onThoughtsChange={setShowThoughts}
        />
      </div>
    </TooltipProvider>
  );
}

function CharacterDialog({
  character,
  open,
  onOpenChange,
  showThoughts,
  onThoughtsChange,
}: {
  character: Character;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showThoughts: boolean;
  onThoughtsChange: (value: boolean) => void;
}) {
  const image = characterImage(character);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[100dvh] w-full max-w-md gap-0 overflow-hidden rounded-none border-0 bg-background p-0 sm:h-[90dvh] sm:rounded-lg sm:border">
        <div className="relative min-h-[48dvh] shrink-0 overflow-hidden bg-secondary sm:min-h-[24rem]">
          {image ? (
            <img src={image} alt={character.name} className="size-full object-cover object-top" />
          ) : (
            <div className="flex size-full items-center justify-center text-8xl">
              {character.avatar}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/5 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
            <DialogTitle className="max-w-[90%] text-3xl font-bold leading-tight sm:text-4xl">
              {character.name}
            </DialogTitle>
            <DialogDescription className="mt-2 line-clamp-3 text-sm leading-relaxed text-foreground/85">
              {character.description}
            </DialogDescription>
          </div>
        </div>
        <div className="space-y-5 overflow-y-auto px-5 pb-28 pt-2">
          <div className="flex flex-wrap gap-2">
            {character.gender && (
              <span className="rounded-full bg-secondary px-3 py-1 text-xs">
                {character.gender}
              </span>
            )}
            {character.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-secondary px-3 py-1.5 text-xs">
                {tag}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-secondary px-4 py-3">
            <Brain className="size-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Pensamentos do personagem</p>
              <p className="text-xs text-muted-foreground">Mostrar emoções internas</p>
            </div>
            <Switch
              checked={showThoughts}
              onCheckedChange={onThoughtsChange}
              aria-label="Mostrar pensamentos"
            />
          </div>
          {character.opening_scene && (
            <div className="border-t border-border pt-4">
              <h3 className="mb-2 text-base font-semibold">Cena de abertura</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {character.opening_scene}
              </p>
            </div>
          )}
          {character.background && (
            <div className="border-t border-border pt-4">
              <h3 className="mb-2 text-base font-semibold">Sobre</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {character.background}
              </p>
            </div>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
          <Button
            type="button"
            size="lg"
            className="h-12 w-full rounded-full font-semibold"
            onClick={() => onOpenChange(false)}
          >
            Continuar história
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Bubble({
  role,
  text,
  character,
  showThoughts,
  busy = false,
  onDelete,
  onRegenerate,
}: {
  role: string;
  text: string;
  character: Character;
  showThoughts: boolean;
  busy?: boolean;
  onDelete?: () => void;
  onRegenerate?: () => void;
}) {
  if (role === "user") {
    const command = parseCommand(text);
    return (
      <Message from="user">
        {command ? (
          <div className="flex justify-center">
            <span className="rounded-full border border-primary/40 bg-chat-glass px-4 py-1.5 text-xs text-primary">
              {command.icon} {command.label}
            </span>
          </div>
        ) : (
          <MessageContent className="whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground">
            {text}
          </MessageContent>
        )}
        {onDelete && (
          <MessageActions className="justify-end opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <MessageAction
              tooltip="Apagar mensagem"
              label="Apagar mensagem"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 className="size-3.5" />
            </MessageAction>
          </MessageActions>
        )}
      </Message>
    );
  }
  const segments = parseNarrativeSegments(text);
  return (
    <Message from="assistant" className="max-w-full">
      <MessageContent className="w-full gap-4 rounded-3xl border border-border/30 bg-chat-panel px-5 py-5 shadow-xl backdrop-blur-md sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none">
        {segments.map((segment, index) =>
          segment.type === "thought" ? (
            showThoughts && (
              <div
                key={`${segment.type}-${index}`}
                className="whitespace-pre-wrap break-words border-l-2 border-primary/50 pl-3 text-sm italic text-muted-foreground"
              >
                {segment.text}
              </div>
            )
          ) : (
            <MessageResponse
              key={`${segment.type}-${index}`}
              className="prose-chat whitespace-pre-wrap break-words text-[17px] leading-[1.55] sm:text-[15px]"
            >
              {segment.text}
            </MessageResponse>
          ),
        )}
      </MessageContent>
      {(onRegenerate || onDelete) && (
        <MessageActions className="px-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {onRegenerate && (
            <MessageAction
              tooltip="Gerar novamente"
              label="Gerar novamente"
              disabled={busy}
              onClick={onRegenerate}
            >
              <RefreshCw className="size-3.5" />
            </MessageAction>
          )}
          {onDelete && (
            <MessageAction
              tooltip="Apagar mensagem"
              label="Apagar mensagem"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 className="size-3.5" />
            </MessageAction>
          )}
        </MessageActions>
      )}
    </Message>
  );
}
