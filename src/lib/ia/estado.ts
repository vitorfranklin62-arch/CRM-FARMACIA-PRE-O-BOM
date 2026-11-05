/**
 * Regras do estado da IA numa conversa — espelho em TypeScript da função
 * `estado_ia()` do banco (migração 20261105_ia_estado_e_recuperacao_22h.sql).
 * Sem imports com "@/" de propósito: este arquivo roda nos testes do Node.
 *
 * Estados (o `status` da conversa continua sendo o que o N8N lê):
 *  - IA_ATIVA          a IA responde (status "aberta", ou pausa já vencida)
 *  - PAUSA_TEMPORARIA  alguém da equipe respondeu: IA pausada até `ia_pausada_ate`
 *  - HUMANO_ASSUMIU    trava sem prazo (botão Travar, transferência da IA)
 *  - BLOQUEADA         número bloqueado pela equipe (nunca liberado sozinho)
 *  - ENCERRADA         conversa fechada (reabre na próxima mensagem do cliente)
 */

export type EstadoIa = "IA_ATIVA" | "PAUSA_TEMPORARIA" | "HUMANO_ASSUMIU" | "BLOQUEADA" | "ENCERRADA";

export type MotivoIa =
  | "manual"
  | "resposta_crm"
  | "transferencia_ia"
  | "nova_conversa_crm"
  | "mesclagem"
  | "legado"
  | "nao_informado"
  | "destravada_manual"
  | "pausa_expirada"
  | "recuperacao_22h"
  | "recuperacao_manual"
  | "cliente_reabriu"
  | "webhook"
  | "encerrada";

/** Minutos que a IA fica pausada quando alguém responde pelo chat (igual ao N8N). */
export const PAUSA_PADRAO_MINUTOS = 10;
/** Teto pra um valor de configuração digitado errado não pausar a IA por dias. */
export const PAUSA_MAXIMA_MINUTOS = 12 * 60;

export type ConversaEstadoEntrada = {
  status: "aberta" | "aguardando_humano" | "fechada" | string;
  ia_pausada_ate?: string | null;
  bloqueada?: boolean | null;
};

export function estadoIa(c: ConversaEstadoEntrada, agora: Date = new Date()): EstadoIa {
  if (c.bloqueada) return "BLOQUEADA";
  if (c.status === "fechada") return "ENCERRADA";
  if (c.status === "aguardando_humano") {
    if (!c.ia_pausada_ate) return "HUMANO_ASSUMIU";
    return Date.parse(c.ia_pausada_ate) > agora.getTime() ? "PAUSA_TEMPORARIA" : "IA_ATIVA";
  }
  return "IA_ATIVA";
}

/** A IA está impedida de responder (por pausa vigente, trava ou bloqueio)? */
export function iaImpedida(c: ConversaEstadoEntrada, agora: Date = new Date()): boolean {
  const e = estadoIa(c, agora);
  return e === "PAUSA_TEMPORARIA" || e === "HUMANO_ASSUMIU" || e === "BLOQUEADA";
}

/** Lê a configuração de minutos de pausa com limites seguros. */
export function minutosDePausa(valorConfig: string | null | undefined): number {
  const n = Number.parseInt(String(valorConfig ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return PAUSA_PADRAO_MINUTOS;
  return Math.min(n, PAUSA_MAXIMA_MINUTOS);
}

/** Campos a gravar em `conversas` quando alguém da equipe responde pelo CRM. */
export function camposPausaPorResposta(minutos: number, ator: string, agora: Date = new Date()) {
  return {
    status: "aguardando_humano" as const,
    ia_pausada_ate: new Date(agora.getTime() + minutos * 60_000).toISOString(),
    ia_motivo: "resposta_crm" as const,
    ia_ator: ator,
  };
}

const ROTULOS_MOTIVO: Record<string, string> = {
  manual: "travada pelo botão",
  resposta_crm: "alguém da equipe respondeu",
  transferencia_ia: "a IA transferiu para atendente",
  nova_conversa_crm: "conversa iniciada pela equipe",
  mesclagem: "conversas mescladas",
  legado: "trava antiga, sem motivo registrado",
  nao_informado: "motivo não informado",
  destravada_manual: "destravada pela equipe",
  pausa_expirada: "a pausa terminou",
  recuperacao_22h: "reativada pela rotina das 22h",
  recuperacao_manual: "reativada pelo painel",
  cliente_reabriu: "o cliente voltou a falar",
  webhook: "atualizada pela integração",
  encerrada: "conversa encerrada",
  numero_bloqueado: "número bloqueado",
  numero_desbloqueado: "número desbloqueado",
};

export function rotuloMotivo(motivo: string | null | undefined): string {
  if (!motivo) return "sem motivo registrado";
  return ROTULOS_MOTIVO[motivo] ?? motivo;
}

export const ROTULOS_ESTADO: Record<EstadoIa, string> = {
  IA_ATIVA: "IA ativa",
  PAUSA_TEMPORARIA: "IA pausada",
  HUMANO_ASSUMIU: "Com atendente",
  BLOQUEADA: "IA bloqueada",
  ENCERRADA: "Encerrada",
};

/** Hora no fuso de Salvador, ex.: "14:32". */
export function horaBahia(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bahia" });
}

/**
 * Próxima execução da rotina das 22h (America/Bahia = UTC-3 fixo, sem horário
 * de verão desde 2012). Devolve o instante em UTC.
 */
export function proximaExecucao22h(agora: Date = new Date()): Date {
  const OFFSET_H = 3; // Bahia = UTC-3
  const local = new Date(agora.getTime() - OFFSET_H * 3_600_000);
  const alvo = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 22 + OFFSET_H, 0, 0));
  if (alvo.getTime() <= agora.getTime()) alvo.setUTCDate(alvo.getUTCDate() + 1);
  return alvo;
}
