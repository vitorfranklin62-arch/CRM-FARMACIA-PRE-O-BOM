"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SquarePen, Send } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Field";

/** Máscara simples enquanto digita: "71999373863" → "(71) 99937-3863". */
function mascararTelefone(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 13);
  // Número com código do país (55...) fica só com os dígitos, sem máscara.
  if (d.length > 11) return d;
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const AVISOS_WHATSAPP = {
  nao_configurado:
    "A mensagem ficou salva no CRM, mas NÃO saiu no WhatsApp: o envio pelo N8N não está configurado (Configurações → Integrações).",
  falhou: "A mensagem ficou salva no CRM, mas o N8N/WhatsApp recusou o envio. Confira a conexão do WhatsApp e tente de novo.",
  incerto: "O N8N demorou pra responder — a mensagem pode ter saído. Confira no WhatsApp antes de reenviar.",
} as const;

/**
 * Botão "Nova conversa" da lista do Chat ao vivo: a equipe digita nome,
 * número e a primeira mensagem, e cai direto na conversa criada.
 */
export function NovaConversaButton() {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  const digitos = telefone.replace(/\D/g, "");
  const podeEnviar = nome.trim() && digitos.length >= 10 && conteudo.trim() && !enviando;

  function fechar() {
    if (enviando) return;
    setAberto(false);
    setErro(null);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEnviar) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/chat/nova-conversa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim(), telefone, conteudo: conteudo.trim() }),
      });
      const json = (await res.json().catch(() => null)) as
        | { conversa_id?: string; whatsapp?: keyof typeof AVISOS_WHATSAPP | "enviado"; error?: string }
        | null;

      if (!res.ok || !json?.conversa_id) {
        setErro(json?.error ?? "Não foi possível enviar. Tente de novo.");
        return;
      }

      if (json.whatsapp && json.whatsapp !== "enviado") alert(AVISOS_WHATSAPP[json.whatsapp]);

      setNome("");
      setTelefone("");
      setConteudo("");
      setAberto(false);
      router.push(`/chat/${json.conversa_id}`);
      router.refresh();
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Nova conversa"
        className="flex items-center gap-1.5 rounded-xl bg-gradiente-sucesso px-2.5 py-1.5 text-xs font-semibold text-white shadow-brilho-sucesso transition hover:brightness-110"
      >
        <SquarePen size={14} /> Nova
      </button>

      <Modal open={aberto} onClose={fechar} title="Nova conversa">
        <form onSubmit={enviar} className="space-y-4">
          <div>
            <Label htmlFor="nova-conversa-nome">Nome do contato</Label>
            <Input
              id="nova-conversa-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Maria Souza"
              maxLength={200}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="nova-conversa-telefone">Número do WhatsApp</Label>
            <Input
              id="nova-conversa-telefone"
              value={telefone}
              onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
              placeholder="(71) 99937-3863"
              inputMode="tel"
              autoComplete="tel"
            />
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
              DDD + número. Se o contato já existir, a mensagem entra na conversa dele.
            </p>
          </div>
          <div>
            <Label htmlFor="nova-conversa-mensagem">Mensagem</Label>
            <Textarea
              id="nova-conversa-mensagem"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="Olá! Aqui é da Farmácia Preço Bom..."
            />
          </div>

          {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10">{erro}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={fechar} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" variant="success" disabled={!podeEnviar}>
              <Send size={15} /> {enviando ? "Enviando..." : "Enviar mensagem"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
