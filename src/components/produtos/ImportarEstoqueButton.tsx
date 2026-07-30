"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ResultadoImportacao {
  total: number;
  atualizados: number;
  criados: number;
  erros: number;
  ignoradas: number;
  primeiroErro?: string | null;
  paginasParaRevisar?: number[];
}

export function ImportarEstoqueButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/produtos/importar-estoque", { method: "POST", body: formData });

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        alert(`O servidor respondeu algo inesperado (status ${res.status}). Veja o Console/Network do navegador.`);
        return;
      }

      if (!res.ok) {
        const message = (data as { error?: string })?.error ?? `Não foi possível importar o arquivo (status ${res.status}).`;
        alert(message);
        return;
      }

      const r = data as ResultadoImportacao;
      const partes = [
        `${r.total} produto(s) encontrados no arquivo`,
        `${r.criados} novo(s) cadastrado(s)`,
        `${r.atualizados} atualizado(s) (estoque/custo)`,
      ];
      if (r.erros > 0) {
        partes.push(`⚠️ ${r.erros} com erro ao salvar`);
        if (r.primeiroErro) partes.push(`Detalhe do erro: ${r.primeiroErro}`);
      }
      if (r.ignoradas > 0) partes.push(`${r.ignoradas} linha(s) ignorada(s) (sem nome ou dados não conferem)`);
      if (r.paginasParaRevisar?.length) {
        partes.push(`⚠️ Confira manualmente a página ${r.paginasParaRevisar.join(", ")} do PDF (nome/valores não bateram).`);
      }
      if (r.criados > 0) {
        partes.push(`\nProdutos novos cadastrados — confira o preço de venda de cada um (os marcados "Revisar preço" ainda não têm preço definido).`);
      }

      alert(`Importação concluída!\n\n${partes.join("\n")}`);
      router.refresh();
    } catch (err) {
      alert(`Erro de conexão ao importar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".fp3,.xml,text/xml,.pdf,application/pdf"
        className="hidden"
        onChange={handleFile}
      />
      <Button size="sm" variant="secondary" disabled={loading} onClick={() => inputRef.current?.click()}>
        <Upload size={15} /> {loading ? "Importando..." : "Importar estoque"}
      </Button>
    </>
  );
}
