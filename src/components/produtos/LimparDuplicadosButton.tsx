"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface PreviewDuplicados {
  totalProdutos: number;
  gruposDuplicados: number;
  linhasParaRemover: number;
  amostra: {
    nome: string;
    mantido: { custo: number | null; preco: number; estoque: number };
    removidos: { custo: number | null; preco: number; estoque: number }[];
  }[];
}

export function LimparDuplicadosButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    try {
      const resPreview = await fetch("/api/produtos/duplicados");
      const preview = (await resPreview.json()) as PreviewDuplicados | { error: string };

      if (!resPreview.ok || "error" in preview) {
        alert((preview as { error?: string }).error ?? "Não foi possível checar duplicados.");
        return;
      }

      if (preview.gruposDuplicados === 0) {
        alert("Nenhum produto duplicado encontrado. Catálogo está limpo.");
        return;
      }

      const amostraTexto = preview.amostra
        .slice(0, 8)
        .map((g) => `• ${g.nome} — mantém 1, remove ${g.removidos.length}`)
        .join("\n");

      const confirmar = confirm(
        `Encontrei ${preview.gruposDuplicados} produto(s) com nome duplicado no catálogo ` +
          `(${preview.linhasParaRemover} linha(s) extra no total, de ${preview.totalProdutos} produtos).\n\n` +
          `Pra cada nome duplicado, mantenho a linha mais recentemente atualizada e removo as outras ` +
          `(produtos já usados em algum pedido não são removidos, ficam protegidos).\n\n` +
          `Exemplos:\n${amostraTexto}${preview.amostra.length > 8 ? "\n..." : ""}\n\n` +
          `Quer remover essas ${preview.linhasParaRemover} linha(s) duplicada(s) agora? Essa ação não pode ser desfeita.`
      );
      if (!confirmar) return;

      const resExecutar = await fetch("/api/produtos/duplicados", { method: "POST" });
      const resultado = await resExecutar.json();

      if (!resExecutar.ok) {
        alert(resultado?.error ?? "Não foi possível remover os duplicados.");
        return;
      }

      alert(
        `Limpeza concluída!\n\n${resultado.removidos} linha(s) duplicada(s) removida(s).` +
          (resultado.bloqueados > 0
            ? `\n⚠️ ${resultado.bloqueados} não puderam ser removidas (provavelmente já usadas em algum pedido).`
            : "")
      );
      router.refresh();
    } catch (err) {
      alert(`Erro de conexão: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="secondary" disabled={loading} onClick={handleClick}>
      <Trash size={15} /> {loading ? "Verificando..." : "Limpar duplicados"}
    </Button>
  );
}
