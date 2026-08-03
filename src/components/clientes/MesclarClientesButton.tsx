"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Merge } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface PreviewDuplicados {
  totalClientes: number;
  numerosComDuplicatas: number;
  clientesParaRemover: number;
  amostra: { telefone: string; mantido: string; removidos: string[] }[];
}

export function MesclarClientesButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    try {
      const resPreview = await fetch("/api/clientes/duplicados");
      const preview = (await resPreview.json()) as PreviewDuplicados | { error: string };

      if (!resPreview.ok || "error" in preview) {
        alert((preview as { error?: string }).error ?? "Não foi possível checar clientes duplicados.");
        return;
      }

      if (preview.numerosComDuplicatas === 0) {
        alert("Nenhum cliente duplicado encontrado.");
        return;
      }

      const amostraTexto = preview.amostra
        .slice(0, 8)
        .map((g) => `• ${g.telefone} — mantém "${g.mantido}", remove ${g.removidos.length} (${g.removidos.join(", ")})`)
        .join("\n");

      const confirmar = confirm(
        `Encontrei ${preview.numerosComDuplicatas} número(s) de telefone com mais de um cliente cadastrado ` +
          `(${preview.clientesParaRemover} linha(s) extra no total, de ${preview.totalClientes}).\n\n` +
          `Vou juntar as conversas e pedidos de cada duplicata no cliente mais recente e remover as ` +
          `linhas extras. Nada de histórico é perdido.\n\n` +
          `Exemplos:\n${amostraTexto}${preview.amostra.length > 8 ? "\n..." : ""}\n\n` +
          `Quer mesclar agora? Essa ação não pode ser desfeita.`
      );
      if (!confirmar) return;

      const resExecutar = await fetch("/api/clientes/duplicados", { method: "POST" });
      const resultado = await resExecutar.json();

      if (!resExecutar.ok) {
        alert(resultado?.error ?? "Não foi possível mesclar os clientes.");
        return;
      }

      alert(
        `Mesclagem concluída!\n\n${resultado.mesclados} cliente(s) duplicado(s) mesclado(s) e removido(s).` +
          (resultado.bloqueados > 0 ? `\n⚠️ ${resultado.bloqueados} não puderam ser mesclados.` : "") +
          `\n\nDica: agora vale rodar também "Mesclar" no Chat ao vivo, pra juntar as conversas que ficaram duplicadas no mesmo cliente.`
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
      <Merge size={15} /> {loading ? "Verificando..." : "Mesclar duplicados"}
    </Button>
  );
}
