"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Merge } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface PreviewDuplicadas {
  totalConversas: number;
  clientesComDuplicatas: number;
  conversasParaRemover: number;
}

export function MesclarConversasButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    try {
      const resPreview = await fetch("/api/conversas/duplicadas");
      const preview = (await resPreview.json()) as PreviewDuplicadas | { error: string };

      if (!resPreview.ok || "error" in preview) {
        alert((preview as { error?: string }).error ?? "Não foi possível checar conversas duplicadas.");
        return;
      }

      if (preview.clientesComDuplicatas === 0) {
        alert("Nenhuma conversa duplicada encontrada.");
        return;
      }

      const confirmar = confirm(
        `Encontrei ${preview.clientesComDuplicatas} cliente(s) com mais de uma conversa ` +
          `(${preview.conversasParaRemover} conversa(s) extra no total, de ${preview.totalConversas}).\n\n` +
          `Vou juntar todas as mensagens de cada cliente numa única conversa (a mais recente) e apagar ` +
          `as duplicatas vazias. Nenhuma mensagem é perdida.\n\n` +
          `Quer mesclar agora? Essa ação não pode ser desfeita.`
      );
      if (!confirmar) return;

      const resExecutar = await fetch("/api/conversas/duplicadas", { method: "POST" });
      const resultado = await resExecutar.json();

      if (!resExecutar.ok) {
        alert(resultado?.error ?? "Não foi possível mesclar as conversas.");
        return;
      }

      alert(
        `Mesclagem concluída!\n\n${resultado.mescladas} conversa(s) duplicada(s) mesclada(s) e removida(s).` +
          (resultado.bloqueadas > 0 ? `\n⚠️ ${resultado.bloqueadas} não puderam ser mescladas.` : "")
      );
      router.refresh();
    } catch (err) {
      alert(`Erro de conexão: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" variant="secondary" disabled={loading} onClick={handleClick} title="Mesclar conversas duplicadas do mesmo cliente">
      <Merge size={15} /> {loading ? "..." : "Mesclar"}
    </Button>
  );
}
