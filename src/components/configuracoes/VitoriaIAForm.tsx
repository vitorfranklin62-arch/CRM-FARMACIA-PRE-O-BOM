"use client";

import { useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Sparkles, Upload, Trash2 } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Label, Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { VitoriaAvatar } from "@/components/consulta-ia/VitoriaAvatar";
import { updateConfiguracoesAction, type ActionState } from "@/app/(app)/configuracoes/actions";

const initialState: ActionState = { error: null };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando..." : "Salvar prompt"}
    </Button>
  );
}

export function VitoriaIAForm({ prompt, fotoUrl }: { prompt: string; fotoUrl: string | null }) {
  const [state, formAction] = useFormState(updateConfiguracoesAction, initialState);

  const inputRef = useRef<HTMLInputElement>(null);
  const [fotoAtual, setFotoAtual] = useState(fotoUrl);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState<string | null>(null);

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setEnviandoFoto(true);
    setErroFoto(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/configuracoes/vitoria-foto", { method: "POST", body: formData });
      const body = await res.json();

      if (!res.ok) {
        setErroFoto(body.error ?? "Não foi possível enviar a imagem.");
        return;
      }
      setFotoAtual(body.url);
    } catch {
      setErroFoto("Erro de conexão ao enviar a imagem.");
    } finally {
      setEnviandoFoto(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemoverFoto() {
    setEnviandoFoto(true);
    setErroFoto(null);
    try {
      const res = await fetch("/api/configuracoes/vitoria-foto", { method: "DELETE" });
      if (!res.ok) {
        setErroFoto("Não foi possível remover a foto.");
        return;
      }
      setFotoAtual(null);
    } catch {
      setErroFoto("Erro de conexão ao remover a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Vitória AI"
        description="Foto e prompt do widget flutuante de referência farmacêutica interna."
        action={
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Sparkles size={18} />
          </div>
        }
      />

      <div className="mb-5 flex items-center gap-4">
        <VitoriaAvatar size={64} fotoUrl={fotoAtual} className="shrink-0" />
        <div className="flex-1 space-y-2">
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFoto} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={enviandoFoto} onClick={() => inputRef.current?.click()}>
              <Upload size={14} /> {enviandoFoto ? "Enviando..." : "Trocar foto"}
            </Button>
            {fotoAtual && (
              <Button type="button" variant="danger" size="sm" disabled={enviandoFoto} onClick={handleRemoverFoto}>
                <Trash2 size={14} /> Remover foto
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-400">JPEG, PNG ou WEBP, até 5MB. Sem foto, usa o desenho padrão.</p>
          {erroFoto && <p className="text-xs text-red-600 dark:text-red-400">{erroFoto}</p>}
        </div>
      </div>

      <form action={formAction} className="space-y-3">
        <div>
          <Label htmlFor="vitoria_ia_prompt">Prompt (instruções da IA)</Label>
          <Textarea id="vitoria_ia_prompt" name="vitoria_ia_prompt" rows={10} defaultValue={prompt} className="font-mono text-xs" />
          <p className="mt-1 text-xs text-gray-400">
            Deixar em branco volta a usar o prompt padrão do sistema. Só afeta o widget Vitória AI, não a IA que
            atende cliente pelo WhatsApp (essa roda no N8N, separada).
          </p>
        </div>
        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            {state.error}
          </p>
        )}
        {state.success && <p className="text-sm text-green-600">Salvo com sucesso.</p>}
        <div className="flex justify-end">
          <SaveButton />
        </div>
      </form>
    </Card>
  );
}
