"use client";

import { useEffect, useState } from "react";
import { CheckCheck, Loader2, Radio } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Estado = { carregando: true } | { carregando: false; ativo: boolean; erro: string | null };

/**
 * Faixa no topo de Campanhas: mostra se a uazapi já avisa o CRM quando um
 * lote termina e quando cada mensagem é entregue/lida (webhook próprio das
 * campanhas). Sem ele o disparo funciona, só que mais devagar entre lotes e
 * sem as colunas "entregues"/"lidas".
 */
export function AcompanhamentoEntrega() {
  const [estado, setEstado] = useState<Estado>({ carregando: true });
  const [ativando, setAtivando] = useState(false);

  useEffect(() => {
    fetch("/api/configuracoes/uazapi/webhook-campanhas")
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        setEstado({ carregando: false, ativo: !!json.ativo, erro: res.ok ? null : json.error ?? `HTTP ${res.status}` });
      })
      .catch(() => setEstado({ carregando: false, ativo: false, erro: "Não foi possível consultar a uazapi." }));
  }, []);

  async function ativar() {
    setAtivando(true);
    const res = await fetch("/api/configuracoes/uazapi/webhook-campanhas", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setAtivando(false);
    setEstado({ carregando: false, ativo: res.ok && !!json.ativo, erro: res.ok ? null : json.error ?? `HTTP ${res.status}` });
  }

  if (estado.carregando) return null;

  if (estado.ativo) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
        <CheckCheck size={14} /> Acompanhamento de entrega ativo: a uazapi avisa o CRM a cada entrega e leitura.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200 sm:flex-row sm:items-center sm:justify-between dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20">
      <div>
        <p className="flex items-center gap-1.5 font-medium">
          <Radio size={15} /> Acompanhamento de entrega desligado
        </p>
        <p className="text-xs">
          Ative para ver quem recebeu e quem leu cada campanha, e para o próximo lote sair assim que o anterior termina.
          {estado.erro && <span className="block text-red-600 dark:text-red-300">{estado.erro}</span>}
        </p>
      </div>
      <Button size="sm" variant="secondary" onClick={ativar} disabled={ativando}>
        {ativando ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />} Ativar
      </Button>
    </div>
  );
}
