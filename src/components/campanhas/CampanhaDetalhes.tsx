"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import { PreviaWhatsapp } from "./PreviaWhatsapp";
import type { Campanha, CampanhaEnvioStatus, CampanhaLoteStatus } from "@/types/database";

type Linha = { status: CampanhaEnvioStatus; erro: string | null; entregue_em: string | null; lido_em: string | null; lote_id: string | null };

type Numeros = {
  total: number;
  aguardandoUazapi: number;
  naFila: number;
  enviadas: number;
  entregues: number;
  lidas: number;
  falhas: number;
  semWhatsapp: number;
  invalidos: number;
  erros: { erro: string; vezes: number }[];
};

/**
 * Lê o registro de envio da campanha e conta cada etapa SEPARADAMENTE. Nada
 * aqui é estimado: "na fila" é quem está num lote que a uazapi aceitou mas
 * ainda não mandou; "enviada" é o que a uazapi diz que saiu; "entregue"/"lida"
 * só sobem com o recibo do WhatsApp (webhook messages_update).
 */
function contar(linhas: Linha[], lotesConfirmados: Set<string>): Numeros {
  const n: Numeros = { total: 0, aguardandoUazapi: 0, naFila: 0, enviadas: 0, entregues: 0, lidas: 0, falhas: 0, semWhatsapp: 0, invalidos: 0, erros: [] };
  const erros = new Map<string, number>();
  for (const l of linhas) {
    if (l.status === "cancelado") continue; // estava num lote que não saiu; volta pra fila depois
    n.total++;
    if (l.status === "agendado") {
      if (l.lote_id && lotesConfirmados.has(l.lote_id)) n.naFila++;
      else n.aguardandoUazapi++;
    }
    if (l.status === "enviado") n.enviadas++;
    if (l.status === "falhou") {
      n.falhas++;
      const chave = (l.erro ?? "Erro não informado pela uazapi").slice(0, 160);
      erros.set(chave, (erros.get(chave) ?? 0) + 1);
    }
    if (l.status === "sem_whatsapp") n.semWhatsapp++;
    if (l.status === "invalido") n.invalidos++;
    if (l.entregue_em) n.entregues++;
    if (l.lido_em) n.lidas++;
  }
  n.erros = Array.from(erros, ([erro, vezes]) => ({ erro, vezes })).sort((a, b) => b.vezes - a.vezes).slice(0, 5);
  return n;
}

function Numero({ rotulo, valor, dica, cor }: { rotulo: string; valor: number; dica: string; cor?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 p-3 dark:border-white/10" title={dica}>
      <p className={`text-xl font-semibold ${cor ?? "text-gray-900 dark:text-white"}`}>{valor}</p>
      <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{rotulo}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-gray-400 dark:text-gray-500">{dica}</p>
    </div>
  );
}

export function CampanhaDetalhes({
  campanha,
  imagemUrl,
  onClose,
}: {
  campanha: Campanha | null;
  imagemUrl: string | null;
  onClose: () => void;
}) {
  const [numeros, setNumeros] = useState<Numeros | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!campanha) return;
    let cancelado = false;
    setNumeros(null);
    setErro(null);
    const supabase = createClient();
    Promise.all([
      supabase
        .from("campanha_envios")
        .select("status, erro, entregue_em, lido_em, lote_id")
        .eq("campanha_id", campanha.id)
        .limit(20000),
      supabase.from("campanha_lotes").select("id, folder_id, status").eq("campanha_id", campanha.id),
    ]).then(([envios, lotes]) => {
      if (cancelado) return;
      if (envios.error) {
        setErro("Não foi possível carregar o relatório de envio.");
        return;
      }
      const confirmados = new Set(
        ((lotes.data ?? []) as { id: string; folder_id: string | null; status: CampanhaLoteStatus }[])
          .filter((l) => l.folder_id)
          .map((l) => l.id)
      );
      setNumeros(contar((envios.data ?? []) as Linha[], confirmados));
    });
    return () => {
      cancelado = true;
    };
  }, [campanha]);

  if (!campanha) return null;

  return (
    <Modal open={!!campanha} onClose={onClose} title={campanha.titulo} size="xl">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Conteúdo</p>
          {campanha.midia_path && !imagemUrl && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              Esta campanha tem imagem, mas ela não pôde ser carregada agora.
            </p>
          )}
          <PreviaWhatsapp mensagem={campanha.mensagem} imagemUrl={imagemUrl} />
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Criada em {formatDateTime(campanha.criado_em)}
            {campanha.agendada_para && <> · agendada para {formatDateTime(campanha.agendada_para)}</>}
            {campanha.enviada_em && <> · concluída em {formatDateTime(campanha.enviada_em)}</>}
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Acompanhamento</p>
          {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}
          {!numeros && !erro && (
            <p className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={15} className="animate-spin" /> Carregando…
            </p>
          )}
          {numeros && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Numero rotulo="Destinatários" valor={numeros.total} dica="Já tratados pelo disparo até agora" />
                <Numero rotulo="Aguardando a uazapi" valor={numeros.aguardandoUazapi} dica="Lote montado, uazapi ainda não confirmou" />
                <Numero rotulo="Na fila da uazapi" valor={numeros.naFila} dica="Aceitas pela uazapi, esperando a vez" />
                <Numero rotulo="Enviadas" valor={numeros.enviadas} dica="A uazapi informou que saiu" cor="text-green-600" />
                <Numero rotulo="Entregues" valor={numeros.entregues} dica="Recibo de entrega do WhatsApp" />
                <Numero rotulo="Lidas" valor={numeros.lidas} dica="Só quem deixa a confirmação de leitura ligada" cor="text-brand-600" />
                <Numero rotulo="Falhas" valor={numeros.falhas} dica="A uazapi não conseguiu enviar" cor={numeros.falhas ? "text-red-500" : undefined} />
                <Numero rotulo="Sem WhatsApp" valor={numeros.semWhatsapp} dica="Conferido na uazapi antes do envio" />
                <Numero rotulo="Inválidos" valor={numeros.invalidos} dica="Telefone fora do padrão" />
              </div>
              {numeros.erros.length > 0 && (
                <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  <p className="mb-1 font-medium">Motivos das falhas</p>
                  <ul className="space-y-0.5">
                    {numeros.erros.map((e) => (
                      <li key={e.erro}>
                        {e.vezes}× {e.erro}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {campanha.status === "pausada" && campanha.motivo_pausa && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  Pausada: {campanha.motivo_pausa}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
