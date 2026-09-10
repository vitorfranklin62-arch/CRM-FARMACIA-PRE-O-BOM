"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type {
  LinhaImportacao,
  ModoGravacao,
  PlanoImportacao,
  ResultadoLote,
  ResultadoRemocao,
} from "@/types/importacao";

/** Linhas por lote enviado ao servidor. Lote pequeno = resposta rápida = barra subindo. */
const LINHAS_POR_LOTE = 250;
/** Tempo limite pra ler o arquivo (etapa 1) — é a parte mais pesada. */
const TIMEOUT_LEITURA = 300_000;
/** Tempo limite de cada lote (etapa 2). */
const TIMEOUT_LOTE = 120_000;
/** Ids por lote na remoção dos produtos que não estão no arquivo. */
const IDS_POR_LOTE_REMOCAO = 100;

interface Lote {
  modo: ModoGravacao;
  linhas: LinhaImportacao[];
}

/** Quebra o plano em lotes pequenos, na ordem: atualizações e depois criações. */
function montarLotes(plano: PlanoImportacao): Lote[] {
  const lotes: Lote[] = [];
  const adicionar = (modo: ModoGravacao, linhas: LinhaImportacao[]) => {
    for (let i = 0; i < linhas.length; i += LINHAS_POR_LOTE) {
      lotes.push({ modo, linhas: linhas.slice(i, i + LINHAS_POR_LOTE) });
    }
  };
  adicionar("atualizar_por_id", plano.atualizarPorId);
  adicionar("atualizar_por_sku", plano.atualizarPorSku);
  adicionar("criar", plano.criar);
  return lotes;
}

async function postarJson(url: string, corpo: unknown, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error((data as { error?: string })?.error ?? `Falha na gravação (status ${res.status}).`);
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function ImportarEstoqueButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progresso, setProgresso] = useState<{ percent: number; fase: string; detalhe: string } | null>(null);
  const router = useRouter();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setProgresso({ percent: 4, fase: "Enviando o arquivo...", detalhe: file.name });

    // Sem timeout, se o servidor travar (ou o proxy derrubar a conexão sem
    // avisar o navegador) a tela fica carregando pra sempre.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_LEITURA);

    try {
      const formData = new FormData();
      formData.append("file", file);

      setProgresso({ percent: 8, fase: "Lendo o arquivo e conferindo o catálogo...", detalhe: file.name });
      const res = await fetch("/api/produtos/importar-estoque", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        alert(`O servidor respondeu algo inesperado (status ${res.status}). Veja o Console/Network do navegador.`);
        return;
      }

      if (!res.ok) {
        alert((data as { error?: string })?.error ?? `Não foi possível importar o arquivo (status ${res.status}).`);
        return;
      }

      const plano = data as PlanoImportacao;
      const lotes = montarLotes(plano);
      const totalLinhas = lotes.reduce((soma, lote) => soma + lote.linhas.length, 0);

      // Produtos cadastrados que não apareceram no arquivo. Só são apagados
      // se a dona confirmar aqui — o padrão é manter tudo.
      const foraDoArquivo = plano.foraDoArquivo ?? [];
      let idsParaRemover: string[] = [];
      if (foraDoArquivo.length > 0) {
        const amostra = foraDoArquivo
          .slice(0, 10)
          .map((p) => `• ${p.nome}`)
          .join("\n");
        const resto = foraDoArquivo.length > 10 ? `\n...e mais ${foraDoArquivo.length - 10}.` : "";
        const confirmar = confirm(
          `O arquivo "${plano.arquivo}" traz ${plano.total} produto(s).\n\n` +
            `${foraDoArquivo.length} produto(s) cadastrados NÃO estão nesse arquivo:\n${amostra}${resto}\n\n` +
            `Quer APAGAR esses ${foraDoArquivo.length} produtos do sistema? Isso não pode ser desfeito.\n` +
            `(Produto que já aparece em algum pedido não é apagado, pra não quebrar o histórico.)\n\n` +
            `OK = apagar. Cancelar = manter todos e só atualizar o catálogo com o arquivo.`
        );
        if (confirmar) idsParaRemover = foraDoArquivo.map((p) => p.id);
      }

      let atualizados = 0;
      let criados = 0;
      let erros = 0;
      let primeiroErro: string | null = null;
      let gravadas = 0;
      let removidos = 0;
      let bloqueados = 0;

      // A barra vai de 10% (arquivo lido) a 100% (tudo gravado e removido).
      const totalTrabalho = totalLinhas + idsParaRemover.length;
      const percentDe = (feitas: number) => (totalTrabalho === 0 ? 100 : 10 + Math.round((feitas / totalTrabalho) * 90));

      for (const lote of lotes) {
        setProgresso({
          percent: percentDe(gravadas),
          fase: lote.modo === "criar" ? "Cadastrando produtos novos..." : "Atualizando produtos...",
          detalhe: `${gravadas} de ${totalLinhas} linha(s)`,
        });

        const resultado = (await postarJson(
          "/api/produtos/importar-estoque/gravar",
          { modo: lote.modo, linhas: lote.linhas },
          TIMEOUT_LOTE
        )) as ResultadoLote;

        if (lote.modo === "criar") criados += resultado.ok;
        else atualizados += resultado.ok;
        erros += resultado.erros;
        primeiroErro ??= resultado.primeiroErro;
        gravadas += lote.linhas.length;

        setProgresso({
          percent: percentDe(gravadas),
          fase: "Gravando...",
          detalhe: `${gravadas} de ${totalLinhas} linha(s)`,
        });
      }

      for (let i = 0; i < idsParaRemover.length; i += IDS_POR_LOTE_REMOCAO) {
        const ids = idsParaRemover.slice(i, i + IDS_POR_LOTE_REMOCAO);

        setProgresso({
          percent: percentDe(gravadas + i),
          fase: "Apagando produtos que não estão no arquivo...",
          detalhe: `${i} de ${idsParaRemover.length} produto(s)`,
        });

        const resultado = (await postarJson(
          "/api/produtos/importar-estoque/remover",
          { ids, arquivo: plano.arquivo },
          TIMEOUT_LOTE
        )) as ResultadoRemocao;

        removidos += resultado.removidos;
        bloqueados += resultado.bloqueados;
        primeiroErro ??= resultado.primeiroErro;
      }

      // Fecha a importação: lote vazio, só com o resumo do que entrou, pra
      // ficar registrado na auditoria com os números finais de verdade.
      await postarJson(
        "/api/produtos/importar-estoque/gravar",
        {
          modo: "criar",
          linhas: [],
          resumo: {
            arquivo: plano.arquivo,
            formato: plano.formato,
            total: plano.total,
            atualizados,
            criados,
            erros,
            ignoradas: plano.ignoradas,
          },
        },
        TIMEOUT_LOTE
      );

      setProgresso({ percent: 100, fase: "Concluído!", detalhe: `${gravadas} de ${totalLinhas} linha(s)` });

      const partes = [
        `${plano.total} produto(s) encontrados no arquivo`,
        `${criados} novo(s) cadastrado(s)`,
        `${atualizados} atualizado(s)`,
      ];
      if (erros > 0) {
        partes.push(`⚠️ ${erros} com erro ao salvar`);
        if (primeiroErro) partes.push(`Detalhe do erro: ${primeiroErro}`);
      }
      if (plano.ignoradas > 0) {
        partes.push(`${plano.ignoradas} linha(s) ignorada(s) (sem nome, dados não conferem, ou duplicada no arquivo)`);
      }
      if (removidos > 0 || bloqueados > 0) {
        partes.push(`${removidos} produto(s) apagados por não estarem no arquivo`);
        if (bloqueados > 0) {
          partes.push(`${bloqueados} não puderam ser apagados (já aparecem em algum pedido) e continuam no catálogo`);
        }
      }
      if (plano.formatoPdf === "lista") {
        partes.push(
          `\nEsse PDF é a lista de medicamentos (nome, laboratório, preço e observações) — ele não traz quantidade, ` +
            `então o estoque de quem já estava cadastrado não foi alterado, e os produtos novos entraram com estoque 0.`
        );
      }
      if (plano.paginasParaRevisar?.length) {
        partes.push(`⚠️ Confira manualmente a página ${plano.paginasParaRevisar.join(", ")} do PDF (nome/valores não bateram).`);
      }
      if (criados > 0) {
        partes.push(`\nProdutos novos cadastrados — confira o preço de venda de cada um (os marcados "Revisar preço" ainda não têm preço definido).`);
      }

      alert(`Importação concluída!\n\n${partes.join("\n")}`);
      router.refresh();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        alert(
          "A leitura do arquivo passou de 5 minutos e foi cancelada. Isso pode indicar lentidão no servidor — tenta de novo, e se continuar acontecendo avisa a equipe técnica."
        );
      } else {
        alert(
          `A importação parou no meio: ${err instanceof Error ? err.message : String(err)}\n\n` +
            `O que já tinha sido gravado até aqui continua salvo. Pode rodar a importação de novo com o mesmo arquivo — ` +
            `ela atualiza o que já existe em vez de duplicar.`
        );
      }
    } finally {
      clearTimeout(timeoutId);
      setProgresso(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const carregando = progresso !== null;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".fp3,.xml,text/xml,.pdf,application/pdf,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={handleFile}
      />
      <Button size="sm" variant="secondary" disabled={carregando} onClick={() => inputRef.current?.click()}>
        <Upload size={15} /> {carregando ? "Importando..." : "Importar estoque"}
      </Button>

      {progresso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/60 bg-white p-6 shadow-card-md dark:border-white/10 dark:bg-navy-800">
            <p className="titulo-gradiente text-lg font-bold">Carregando</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{progresso.fase}</p>

            <div
              className="mt-4 h-3 w-full overflow-hidden rounded-full bg-brand-100 dark:bg-white/10"
              role="progressbar"
              aria-valuenow={progresso.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso da importação"
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 via-violet-500 to-accent-500 transition-[width] duration-300"
                style={{ width: `${progresso.percent}%` }}
              />
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span className="truncate">{progresso.detalhe}</span>
              <span className="ml-2 shrink-0 font-mono font-semibold tabular-nums text-brand-700 dark:text-brand-200">
                {progresso.percent}%
              </span>
            </div>

            <p className="mt-4 text-[11px] leading-snug text-gray-400 dark:text-gray-500">
              Não feche essa página até terminar. Os produtos são gravados aos poucos, então nada se perde se der algum erro no meio.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
