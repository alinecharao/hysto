import { useState } from "react";
import type { Character } from "@/lib/characters";

const EMOJIS = ["🙂", "😎", "🤖", "👻", "🦊", "🐉", "🧛", "🧚", "👑", "🎭", "🌸", "⚔️", "🔮", "🐱", "🚀", "💀"];

export type CharacterInput = Pick<
  Character,
  "name" | "avatar" | "tagline" | "personality" | "instructions" | "greeting"
>;

export function CharacterForm({
  initial,
  submitLabel,
  onSubmit,
  onDelete,
}: {
  initial?: Partial<CharacterInput>;
  submitLabel: string;
  onSubmit: (v: CharacterInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [v, setV] = useState<CharacterInput>({
    name: initial?.name ?? "",
    avatar: initial?.avatar ?? "🙂",
    tagline: initial?.tagline ?? "",
    personality: initial?.personality ?? "",
    instructions: initial?.instructions ?? "",
    greeting: initial?.greeting ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof CharacterInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV({ ...v, [k]: e.target.value });

  const field = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!v.name.trim()) return setError("Dê um nome ao personagem.");
        setBusy(true);
        setError(null);
        try {
          await onSubmit(v);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Erro ao salvar.");
          setBusy(false);
        }
      }}
    >
      <div>
        <label className="mb-2 block text-sm font-medium">Avatar</label>
        <div className="flex flex-wrap gap-2">
          {EMOJIS.map((em) => (
            <button
              type="button"
              key={em}
              onClick={() => setV({ ...v, avatar: em })}
              className={`flex size-11 items-center justify-center rounded-lg border text-2xl ${v.avatar === em ? "border-primary bg-secondary" : "border-border"}`}
            >
              {em}
            </button>
          ))}
          <input
            value={v.avatar}
            onChange={set("avatar")}
            maxLength={4}
            className="size-11 rounded-lg border border-input bg-background text-center text-2xl"
            aria-label="Emoji personalizado"
          />
        </div>
      </div>
      <Field label="Nome"><input className={field} value={v.name} onChange={set("name")} /></Field>
      <Field label="Descrição curta"><input className={field} value={v.tagline} onChange={set("tagline")} placeholder="Ex: Bruxa sarcástica da floresta" /></Field>
      <Field label="Personalidade"><textarea rows={3} className={field} value={v.personality} onChange={set("personality")} placeholder="Como ele é, jeito de falar, gostos..." /></Field>
      <Field label="Instruções"><textarea rows={4} className={field} value={v.instructions} onChange={set("instructions")} placeholder="Regras de comportamento, cenário, o que evitar..." /></Field>
      <Field label="Primeira mensagem"><textarea rows={2} className={field} value={v.greeting} onChange={set("greeting")} placeholder="Como ele cumprimenta você" /></Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between">
        <button disabled={busy} className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? "Salvando..." : submitLabel}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={async () => {
              if (confirm("Excluir este personagem e toda a conversa?")) await onDelete();
            }}
            className="text-sm text-destructive hover:underline"
          >
            Excluir
          </button>
        )}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
