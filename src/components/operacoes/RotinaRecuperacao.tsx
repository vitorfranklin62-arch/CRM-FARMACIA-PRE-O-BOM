"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { rotuloMotivo } from "@/lib/ia/estado";

type Simulacao = {
  seriam_reativadas: number;
  por_motivo: Record<string, number>;
  preservadas_numero_bloqueado: number;
  preservadas_trava_manual: number;
};

/**
 * Verificação manual da rotina das 22h. Primeiro SIMULA (não muda nada) e
 * mostra o que aconteceria; só depois de ver os números a dona confirma.
 */
export function RotinaRecuperacao({ desabilitado }: { desabilitado?: boolean }) {
  const router = useRouter();
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null);
  const [carregando, setCarregando] = useState<"simular" | "executar" | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function chamar(simular: boolean) {
    setCarregando(simular ? "simular" : "executar");
    setMensagem(null);
    try {
      const res = await fetch("/api/operacoes/recuperacao-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(simular ? { simular: true } : { simular: false, confirmar: true }),
      });
      const dados = await res.json().catch(() => null);
      if (!res.ok) throw new Error(dados?.error ?? "A verificação falhou.");
      if (simular) {
        setSimulacao(dados as Simulacao);
      } else if (dados?.erro) {
        setMensagem({ tipo: "erro", texto: `A rotina falhou e nada foi alterado. Uma tarefa técnica foi aberta. (${dados.erro})` });
      } else {
        setSimulacao(null);
        setMensagem({ tipo: "ok", texto: `Pronto: a IA voltou a atender ${dados?.reativadas ?? 0} conversa(s). Nenhuma mensagem foi enviada.` });
        router.refresh();
      }
    } catch (e) {
      setMensagem({ tipo: "erro", texto: e instanceof Error ? e.message : "A verificação falhou." });
    }
    setCarregando(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => chamar(true)} disabled={desabilitado || !!carregando}>
          <Eye size={15} /> {carregando === "simular" ? "Verificando…" : "Verificar agora (sem alterar)"}
        </Button>
        {simulacao && simulacao.seriam_reativadas > 0 && (
          <Button
            onClick={() => {
              if (
                confirm(
                  `Reativar a IA em ${simulacao.seriam_reativadas} conversa(s) agora?\n\nNúmeros bloqueados e conversas travadas pelo botão continuam como estão. Nenhuma mensagem será enviada.`
                )
              ) {
                chamar(false);
              }
            }}
            disabled={!!carregando}
          >
            <RotateCcw size={15} /> {carregando === "executar" ? "Reativando…" : `Reativar ${simulacao.seriam_reativadas} agora`}
          </Button>
        )}
      </div>

      {simulacao && (
        <div className="rounded-xl bg-brand-50/70 p-3 text-sm text-gray-700 ring-1 ring-inset ring-brand-100 dark:bg-white/5 dark:text-gray-200 dark:ring-white/10">
          {simulacao.seriam_reativadas === 0 ? (
            <p>Nenhuma conversa precisa ser reativada agora. ✅</p>
          ) : (
            <>
              <p className="font-semibold">A IA voltaria a atender {simulacao.seriam_reativadas} conversa(s):</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {Object.entries(simulacao.por_motivo).map(([motivo, qtd]) => (
                  <li key={motivo}>
                    {qtd} — {rotuloMotivo(motivo)}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Ficam como estão: {simulacao.preservadas_numero_bloqueado} número(s) bloqueado(s) e {simulacao.preservadas_trava_manual} conversa(s)
            travada(s) pelo botão.
          </p>
        </div>
      )}

      {mensagem && (
        <p
          role="status"
          className={
            mensagem.tipo === "ok"
              ? "rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"
          }
        >
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
