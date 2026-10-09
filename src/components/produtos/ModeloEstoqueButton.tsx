"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, Download, FileSpreadsheet, Sparkles, Table2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  COLUNAS_MODELO,
  DETALHES_COLUNAS,
  LINHAS_EXEMPLO,
  NOME_ARQUIVO_MODELO,
  gerarModeloXlsx,
  modeloComoTexto,
  montarPromptIA,
} from "@/lib/modelo-estoque";

type Aviso = { tipo: "ok" | "erro"; texto: string };

/** Copia pro clipboard; cai num <textarea> temporário quando a API moderna não existe (alguns celulares / http). */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // segue pro plano B
  }
  try {
    const area = document.createElement("textarea");
    area.value = texto;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, texto.length);
    const copiou = document.execCommand("copy");
    document.body.removeChild(area);
    return copiou;
  } catch {
    return false;
  }
}

/**
 * Botão "Modelo de Estoque": abre uma janela com o formato exato que a
 * importação aceita (ver src/lib/modelo-estoque.ts), um prompt pronto pra IA
 * e o download de uma planilha de exemplo. Não importa nada nem toca no banco.
 */
export function ModeloEstoqueButton() {
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [baixando, setBaixando] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  function mostrarAviso(a: Aviso) {
    setAviso(a);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setAviso(null), 4000);
  }

  async function copiar(texto: string) {
    const ok = await copiarTexto(texto);
    mostrarAviso(
      ok
        ? { tipo: "ok", texto: "Copiado com sucesso!" }
        : { tipo: "erro", texto: "Não foi possível copiar automaticamente. Use \"Ver o prompt\" abaixo e copie o texto na mão." }
    );
  }

  async function baixar() {
    if (baixando) return;
    setBaixando(true);
    try {
      const bytes = await gerarModeloXlsx();
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = NOME_ARQUIVO_MODELO;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      mostrarAviso({ tipo: "ok", texto: "Modelo baixado! Procure em Downloads." });
    } catch {
      mostrarAviso({ tipo: "erro", texto: "Não foi possível gerar o arquivo. Tente de novo." });
    } finally {
      setBaixando(false);
    }
  }

  const botaoAcao =
    "flex w-full flex-col items-center gap-1.5 rounded-xl border border-brand-200/70 bg-brand-50/60 px-3 py-3 text-center text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-brand-100 dark:hover:bg-white/10";

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setAberto(true)}>
        <FileSpreadsheet size={15} /> Modelo de Estoque
      </Button>

      <Modal open={aberto} onClose={() => setAberto(false)} title="Modelo de Estoque" size="lg">
        <div className="space-y-5 text-sm text-gray-700 dark:text-gray-200">
          <p>
            Este é o formato exato de planilha que a importação de estoque aceita. Você pode baixar o modelo ou copiar um prompt
            pronto para pedir a uma IA (ChatGPT, Claude etc.) que arrume a sua planilha antes de importar.
          </p>

          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => copiar(montarPromptIA())} className={botaoAcao}>
              <Sparkles size={18} />
              Copiar prompt para IA
            </button>
            <button type="button" onClick={() => copiar(modeloComoTexto())} className={botaoAcao}>
              <ClipboardCopy size={18} />
              Copiar modelo
            </button>
            <button type="button" onClick={baixar} disabled={baixando} className={botaoAcao}>
              <Download size={18} />
              {baixando ? "Gerando..." : "Baixar modelo"}
            </button>
          </div>

          <div aria-live="polite" className="min-h-[1.5rem]">
            {aviso && (
              <p
                className={
                  aviso.tipo === "ok"
                    ? "flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-300"
                    : "font-medium text-red-600 dark:text-red-300"
                }
              >
                {aviso.tipo === "ok" && <Check size={16} />}
                {aviso.texto}
              </p>
            )}
          </div>

          <section>
            <h4 className="mb-2 font-semibold text-gray-900 dark:text-white">Colunas (nesta ordem)</h4>
            <div className="space-y-2">
              {DETALHES_COLUNAS.map((c, i) => (
                <div key={c.coluna} className="rounded-xl border border-gray-100 p-3 dark:border-white/10">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700 dark:bg-white/10 dark:text-brand-100">
                      {i + 1}
                    </span>
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs font-semibold dark:bg-white/10">{c.coluna}</code>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {c.obrigatoria ? "obrigatória" : "opcional"} · {c.formato}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{c.regra}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h4 className="mb-2 flex items-center gap-1.5 font-semibold text-gray-900 dark:text-white">
              <Table2 size={15} /> Exemplo de preenchimento
            </h4>
            <div className="rolagem-fina overflow-x-auto rounded-xl border border-gray-100 dark:border-white/10">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="bg-brand-50 text-brand-800 dark:bg-white/10 dark:text-brand-100">
                  <tr>
                    {COLUNAS_MODELO.map((c) => (
                      <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {LINHAS_EXEMPLO.map((linha, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-white/10">
                      {linha.map((celula, j) => (
                        <td key={j} className="px-3 py-2 align-top">
                          {celula === "" ? <span className="text-gray-300">(vazio)</span> : String(celula)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              Produtos fictícios (começam com &quot;EXEMPLO -&quot;). Não importe esse arquivo como está.
            </p>
          </section>

          <section>
            <h4 className="mb-2 font-semibold text-gray-900 dark:text-white">Formato do arquivo e como importar</h4>
            <ul className="list-disc space-y-1 pl-5 text-xs text-gray-600 dark:text-gray-300">
              <li>
                Este modelo é para arquivo <strong>.xlsx</strong> (Excel). A importação também lê PDF e .fp3/.xml, mas esses têm
                outro formato. CSV e .xls <strong>não</strong> são aceitos.
              </li>
              <li>Tamanho máximo: 15 MB. Só a primeira aba é lida; o cabeçalho fica na linha 1.</li>
              <li>Os nomes das colunas precisam ser idênticos (maiúsculas e acentos). Colunas extras são ignoradas.</li>
              <li>Clique em &quot;Importar estoque&quot; e escolha o arquivo. Nada é gravado até a importação rodar.</li>
              <li>O produto é reconhecido pelo nome: nome igual atualiza o cadastro; nome novo cria um produto.</li>
            </ul>
          </section>

          <section className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <h4 className="mb-1 font-semibold">Atenção antes de importar</h4>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Preço e quantidade são <strong>substituídos</strong> pelos do arquivo. QUANTIDADE vazia vira 0.
              </li>
              <li>LABORATÓRIO ou OBSERVAÇÕES vazios apagam o que já está cadastrado nesse produto.</li>
              <li>
                Preço como texto com ponto de milhar (1.234,50) ou com &quot;R$&quot; é lido como 0 — use só o número.
              </li>
              <li>
                Este formato não lê custo, código (SKU), validade nem código de barras. Se a sua planilha tiver, essas colunas serão
                ignoradas.
              </li>
              <li>Se produtos cadastrados não estiverem no arquivo, o sistema pergunta se você quer apagá-los. Cancelar mantém todos.</li>
            </ul>
          </section>

          <details className="rounded-xl border border-gray-100 p-3 dark:border-white/10">
            <summary className="cursor-pointer text-xs font-semibold text-brand-700 dark:text-brand-200">Ver o prompt que será copiado</summary>
            <pre className="rolagem-fina mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">
              {montarPromptIA()}
            </pre>
          </details>
        </div>
      </Modal>
    </>
  );
}
