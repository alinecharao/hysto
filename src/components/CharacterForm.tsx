import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Character } from "@/lib/characters";

const EMOJIS = ["🙂", "😎", "🤖", "👻", "🦊", "🐉", "🧛", "🧚", "👑", "🎭", "🌸", "⚔️", "🔮", "🐱", "🚀", "💀"];
const GENDERS = ["Feminino", "Masculino", "Não binário", "Outro"];
const TAG_SUGGESTIONS = ["Romance", "Fantasia", "Mistério", "Ficção científica", "Drama", "Aventura", "Terror", "Comédia", "Histórico", "Slice of life"];

export type CharacterInput = Pick<
  Character,
  "name" | "avatar" | "image_url" | "gender" | "tags" | "description" | "opening_scene" | "background"
>;

export function CharacterForm({
  initial,
  submitLabel,
  userId,
  onSubmit,
  onDelete,
}: {
  initial?: Partial<CharacterInput>;
  submitLabel: string;
  userId: string;
  onSubmit: (v: CharacterInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [v, setV] = useState<CharacterInput>({
    name: initial?.name ?? "",
    avatar: initial?.avatar ?? "🙂",
    image_url: initial?.image_url ?? "",
    gender: initial?.gender ?? "",
    tags: initial?.tags ?? [],
    description: initial?.description ?? "",
    opening_scene: initial?.opening_scene ?? "",
    background: initial?.background ?? "",
  });
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set =
    (k: keyof CharacterInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((prev) => ({ ...prev, [k]: e.target.value }));

  const field =
    "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  function addTag(raw: string) {
    const t = raw.trim().replace(/,+$/, "");
    if (!t) return;
    setV((prev) => (prev.tags.includes(t) ? prev : { ...prev, tags: [...prev.tags, t] }));
    setTagDraft("");
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("character-photos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data, error: signErr } = await supabase.storage
        .from("character-photos")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signErr) throw signErr;
      setV((prev) => ({ ...prev, image_url: data.signedUrl }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a foto.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      className="space-y-7"
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
      <section className="space-y-4">
        <label className="block text-sm font-medium">Foto</label>
        <div className="flex items-start gap-4">
          <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-secondary text-4xl">
            {v.image_url ? (
              <img src={v.image_url} alt="Foto do personagem" className="size-full object-cover" />
            ) : (
              v.avatar
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="rounded-full border border-border px-4 py-1.5 text-xs hover:border-primary disabled:opacity-50"
              >
                {uploading ? "Enviando..." : "Enviar imagem"}
              </button>
              {v.image_url && (
                <button
                  type="button"
                  onClick={() => setV((prev) => ({ ...prev, image_url: "" }))}
                  className="rounded-full border border-border px-4 py-1.5 text-xs text-destructive hover:border-destructive"
                >
                  Remover foto
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadPhoto(f);
                e.target.value = "";
              }}
            />
            <input
              className={field}
              value={v.image_url}
              onChange={set("image_url")}
              placeholder="ou cole o link de uma imagem (https://...)"
            />
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Sem foto? Escolha um emoji.</p>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((em) => (
              <button
                type="button"
                key={em}
                onClick={() => setV((prev) => ({ ...prev, avatar: em }))}
                className={`flex size-10 items-center justify-center rounded-lg border text-xl ${v.avatar === em ? "border-primary bg-secondary" : "border-border"}`}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      </section>

      <Field label="Nome">
        <input className={field} value={v.name} onChange={set("name")} placeholder="Ex: Luna Corvo" />
      </Field>

      <Field label="Gênero">
        <div className="flex flex-wrap gap-2">
          {GENDERS.map((g) => (
            <button
              type="button"
              key={g}
              onClick={() => setV((prev) => ({ ...prev, gender: g }))}
              className={`rounded-full border px-4 py-1.5 text-xs ${v.gender === g ? "border-primary bg-secondary" : "border-border"}`}
            >
              {g}
            </button>
          ))}
          <input
            className="w-40 rounded-full border border-input bg-background px-4 py-1.5 text-xs outline-none focus:border-primary"
            value={v.gender}
            onChange={set("gender")}
            placeholder="ou escreva"
          />
        </div>
      </Field>

      <Field label="Tags">
        <div className="space-y-2">
          {v.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {v.tags.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setV((prev) => ({ ...prev, tags: prev.tags.filter((x) => x !== t) }))}
                  className="rounded-full bg-secondary px-3 py-1 text-xs"
                  title="Remover"
                >
                  {t} ×
                </button>
              ))}
            </div>
          )}
          <input
            className={field}
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(tagDraft);
              }
            }}
            placeholder="Digite e aperte Enter"
          />
          <div className="flex flex-wrap gap-2">
            {TAG_SUGGESTIONS.filter((t) => !v.tags.includes(t)).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => addTag(t)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
              >
                + {t}
              </button>
            ))}
          </div>
        </div>
      </Field>

      <Field label="Descrição" hint="Apresentação do personagem, história ou ambos. Aparece no cartão e no topo do chat.">
        <textarea rows={3} className={field} value={v.description} onChange={set("description")} />
      </Field>

      <Field
        label="Cena de abertura"
        hint="Prepara o cenário da primeira mensagem: o que está acontecendo, o que o personagem diz e como ele age."
      >
        <textarea rows={5} className={field} value={v.opening_scene} onChange={set("opening_scene")} />
      </Field>

      <Field
        label="Fundo"
        hint="Detalhes para lembrar: aparência, personalidade, história, relacionamento e cenário. Inclua regras ou elementos da trama para manter as respostas consistentes."
      >
        <textarea rows={8} className={field} value={v.background} onChange={set("background")} />
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between">
        <button
          disabled={busy}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {hint && <p className="mb-2 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}
