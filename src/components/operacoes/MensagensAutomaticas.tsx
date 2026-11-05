"use client";

import { useState } from "react";
import { Eye, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { EXEMPLO_VARIAVEIS, VARIAVEIS_POR_CHAVE, renderizarTemplate, validarTemplate } from "@/lib/mensagens/template";
import type { MensagemAutomatica } from "@/types/database";

/** Negrito do WhatsApp (*texto*) na pré-visualização. */
function previaWhatsapp(texto: string) {
  return texto.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
    parte.startsWith("*") && parte.endsWith("*") && parte.length > 2 ? <strong key={i}>{parte.slice(1, -1)}</strong> : <span key={i}>{parte}</span>
  );
}

export function MensagensAutomaticas({
  mensagens,
  avisosPedidoLigados,
}: {
  mensagens: MensagemAutomatica[];
  avisosPedidoLigados: boolean;
}) {
  const [ligados, setLigados] = useState(avisosPedidoLigados);
  const [salvandoInterruptor, setSalvandoInterruptor] = useState(false);
  const [erroInterruptor, setErroInterruptor] = useState<string | null>(null);

  async function alternarAvisos() {
    const novo = !ligados;
    if (
      novo &&
      !confirm(
        "Ligar os avisos automáticos de pedido?\n\nA partir de agora, ao mover um cartão no quadro de Pedidos (Separando, Pronto, Finalizado), o cliente recebe a mensagem correspondente pelo WhatsApp. Cada aviso sai no máximo uma vez por pedido."
      )
    ) {
      return;
    }
    setSalvandoInterruptor(true);
    setErroInterruptor(null);
    const res = await fetch("/api/operacoes/avisos-pedido", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: novo }),
    }).catch(() => null);
    if (res?.ok) setLigados(novo);
    else setErroInterruptor("Não foi possível salvar. Tente de novo.");
    setSalvandoInterruptor(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl bg-gray-50/80 p-4 sm:flex-row sm:items-center sm:justify-between dark:bg-white/5">
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">Avisar o cliente quando o pedido muda de etapa</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Desligado por padrão. O aviso de encomenda que chegou funciona sempre (já existia).
          </p>
          {erroInterruptor && <p className="mt-1 text-xs text-red-600">{erroInterruptor}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={ligados}
          aria-label="Avisos automáticos de pedido"
          onClick={alternarAvisos}
          disabled={salvandoInterruptor}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50",
            ligados ? "bg-emerald-500" : "bg-gray-300 dark:bg-white/20"
          )}
        >
          <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition", ligados ? "translate-x-6" : "translate-x-1")} />
        </button>
      </div>

      <ul className="grid gap-4 lg:grid-cols-2">
        {mensagens.map((m) => (
          <EditorMensagem key={m.chave} mensagem={m} />
        ))}
      </ul>
    </div>
  );
}

function EditorMensagem({ mensagem }: { mensagem: MensagemAutomatica }) {
  const [texto, setTexto] = useState(mensagem.conteudo);
  const [ativo, setAtivo] = useState(mensagem.ativo);
  const [salvo, setSalvo] = useState(mensagem.conteudo);
  const [estado, setEstado] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [semNome, setSemNome] = useState(false);

  const validacao = validarTemplate(mensagem.chave, texto);
  const alterado = texto !== salvo;
  const previa = renderizarTemplate(texto, { ...EXEMPLO_VARIAVEIS, primeiro_nome: semNome ? "" : EXEMPLO_VARIAVEIS.primeiro_nome });

  async function salvar(campos: { conteudo?: string; ativo?: boolean }) {
    setSalvando(true);
    setEstado(null);
    const res = await fetch("/api/operacoes/mensagens-automaticas", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave: mensagem.chave, ...campos }),
    }).catch(() => null);
    const dados = await res?.json().catch(() => null);
    setSalvando(false);
    if (!res?.ok) {
      setEstado({ tipo: "erro", texto: dados?.error ?? "Não foi possível salvar." });
      return false;
    }
    if (campos.conteudo !== undefined) setSalvo(campos.conteudo.trim());
    setEstado({ tipo: "ok", texto: "Salvo." });
    return true;
  }

  return (
    <li className="space-y-2 rounded-2xl border border-gray-100 p-4 dark:border-white/10">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">{mensagem.titulo}</p>
          {mensagem.descricao && <p className="text-xs text-gray-500 dark:text-gray-400">{mensagem.descricao}</p>}
        </div>
        <button
          type="button"
          onClick={async () => {
            if (await salvar({ ativo: !ativo })) setAtivo(!ativo);
          }}
          disabled={salvando}
          className="shrink-0"
          title={ativo ? "Clique para desativar esta mensagem" : "Clique para ativar esta mensagem"}
        >
          <Badge variant={ativo ? "green" : "gray"} comBolinha>
            {ativo ? "Ativa" : "Desativada"}
          </Badge>
        </button>
      </div>

      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={5}
        maxLength={1500}
        aria-label={`Texto da mensagem ${mensagem.titulo}`}
        aria-invalid={!validacao.ok}
      />
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Variáveis: {(VARIAVEIS_POR_CHAVE[mensagem.chave] ?? []).map((v) => `{${v}}`).join(" ")} · *negrito* · {texto.length}/1500
      </p>
      {!validacao.ok && <p className="text-xs font-medium text-red-600 dark:text-red-400">{validacao.erro}</p>}

      <div className="rounded-xl bg-[#e7f7e1] p-3 text-sm text-gray-800 dark:bg-emerald-900/30 dark:text-emerald-50">
        <p className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          <span className="flex items-center gap-1">
            <Eye size={12} /> Pré-visualização
          </span>
          <label className="flex items-center gap-1 font-normal normal-case tracking-normal">
            <input type="checkbox" checked={semNome} onChange={(e) => setSemNome(e.target.checked)} /> cliente sem nome
          </label>
        </p>
        <p className="whitespace-pre-line">{previaWhatsapp(previa)}</p>
      </div>

      <div className="flex items-center justify-end gap-2">
        {estado && (
          <span className={cn("text-xs", estado.tipo === "ok" ? "text-emerald-600" : "text-red-600")} role="status">
            {estado.texto}
          </span>
        )}
        {alterado && (
          <Button size="sm" variant="ghost" onClick={() => setTexto(salvo)} disabled={salvando}>
            Desfazer
          </Button>
        )}
        <Button size="sm" onClick={() => salvar({ conteudo: texto })} disabled={!alterado || !validacao.ok || salvando}>
          <Save size={14} /> Salvar texto
        </Button>
      </div>
    </li>
  );
}
