import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { ClienteTagComTag } from "@/types/relations";

/**
 * Lista de badges de tag de um cliente. Reaproveitada na tabela de Clientes
 * e no cabeçalho do Chat — mesma cara nos dois lugares. Sem `onClick`, é só
 * leitura; com `onClick`, vira um botão que abre o gerenciador de tags.
 */
export function TagPills({
  tags,
  onClick,
  emptyLabel = "+ adicionar tag",
  className,
}: {
  tags: ClienteTagComTag[];
  onClick?: () => void;
  emptyLabel?: string;
  className?: string;
}) {
  const conteudo =
    tags.length === 0 ? (
      <span className="text-xs text-gray-300 dark:text-gray-600">{emptyLabel}</span>
    ) : (
      tags.map(
        (ct) =>
          ct.tags && (
            <Badge key={ct.tag_id} variant={ct.tags.cor} className="text-[10px]">
              {ct.tags.nome}
            </Badge>
          )
      )
    );

  if (!onClick) {
    return <div className={cn("flex flex-wrap items-center gap-1", className)}>{conteudo}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={cn("flex flex-wrap items-center gap-1 text-left", className)}>
      {conteudo}
    </button>
  );
}
