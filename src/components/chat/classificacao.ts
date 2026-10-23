import { CheckCircle2, Clock, MessageCircle } from "lucide-react";
import type { ConversaClassificacao } from "@/types/database";

/**
 * Classificação do atendimento (conversas.classificacao) — usada no
 * classificador do cabeçalho da conversa e nos filtros da lista. Não tem a
 * ver com a IA: quem trava/destrava a IA é conversas.status.
 */
export const CLASSIFICACOES: {
  valor: ConversaClassificacao;
  label: string;
  curto: string;
  icone: typeof MessageCircle;
  variante: "blue" | "yellow" | "green";
  ativo: string;
}[] = [
  {
    valor: "aberta",
    label: "Aberta",
    curto: "Aberta",
    icone: MessageCircle,
    variante: "blue",
    ativo: "bg-brand-500 text-white shadow-brilho-marca",
  },
  {
    valor: "aguardando_cliente",
    label: "Aguardando o cliente",
    curto: "Aguardando",
    icone: Clock,
    variante: "yellow",
    ativo: "bg-amber-500 text-white",
  },
  {
    valor: "resolvida",
    label: "Resolvida",
    curto: "Resolvida",
    icone: CheckCircle2,
    variante: "green",
    ativo: "bg-gradiente-sucesso text-white shadow-brilho-sucesso",
  },
];

export const CLASSIFICACAO_POR_VALOR = Object.fromEntries(CLASSIFICACOES.map((c) => [c.valor, c])) as Record<
  ConversaClassificacao,
  (typeof CLASSIFICACOES)[number]
>;
