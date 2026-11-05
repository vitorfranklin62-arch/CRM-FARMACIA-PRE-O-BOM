# Auditoria dos fluxos (05/11/2026)

Levantamento dos fluxos da farmácia no N8N e das automações do CRM. Nenhum
fluxo foi apagado, desativado ou alterado — esta é a lista para decisão.

## Fluxos da farmácia no N8N

| Fluxo | Estado | Papel na arquitetura | Recomendação |
|---|---|---|---|
| Receber Mensagem (WhatsApp/IA) `GNwNsh8vMoZW9N1a` | Ativo | **Fluxo 1 — Atendimento principal** (entrada do WhatsApp, IA, pausas) **+ Fluxo 3** (webhook "Envia" = respostas da equipe pelo CRM) | Manter. Aplicar `docs/n8n-ajustes.md` |
| Follow-up sem resposta `bFdWllpmYWgw1nKr` | Ativo (1/min) | Atendimento: até 2 lembretes gerados pela IA | Manter. Já respeita pausa do Redis, `status` da conversa, `ia_bloqueada` e opt-out |
| Tick das campanhas (uazapi) `Psrnx0Nm7J6UHgUZ` | Ativo (2/min) | Fluxo 4 — automação (campanhas) | Manter |
| Vitória AI (consulta interna) `mrweaM9cEWP5qog3` | Ativo | Ferramenta interna da equipe (não fala com cliente) | Manter |
| Disparar Campanha (anti-ban) `GA0WildYcwveugph` | **Inativo** | Disparo antigo, substituído pelo Tick + fila da uazapi | **Candidato a arquivar.** Não reativar: duplicaria envios |
| Monitor de campanhas (leitura) `cCPazhogNaQlkQoZ` | Inativo, manual | Diagnóstico | Manter (só leitura, sob demanda) |
| envia mensagemCRM `YeV1A4PCVaXltA3q` | Inativo desde set/2026 | Desconhecido (provável versão antiga do "Webhook Envia") | Conferir e arquivar se não for usado |

## Consolidação feita no CRM

| Antes | Agora |
|---|---|
| Aviso de encomenda passava pelo webhook de **resposta de atendente** do N8N (pausava a IA) | Sai direto pela uazapi, com texto editável e reserva anti-duplicidade |
| Texto do aviso de encomenda fixo no código | Central de mensagens automáticas (`mensagens_automaticas`), editável no painel |
| Quadro de Pedidos gravava status direto no banco, sem efeito colateral | `POST /api/pedidos/:id/status`: status + histórico + aviso opcional ao cliente |
| 6 lugares gravando "IA travada" cada um do seu jeito | `src/lib/ia/pausa.ts` + trigger no banco: motivo, ator e evento sempre registrados |
| Nenhuma recuperação de trava | Rotina das 22h (pg_cron) + liberação de pausa vencida em `deve_ia_responder` |

## Mapa conceitual

- **Fluxo 1 – Atendimento principal:** N8N "Receber Mensagem" → `/api/webhooks/mensagem`, `deve_ia_responder`, `/api/ia/ferramentas`.
- **Fluxo 2 – Pedidos e encomendas:** `/api/webhooks/pedido` (IA cria), `/api/pedidos/:id/status` e `/api/encomendas/:id/status` (equipe avança) → `src/lib/mensagens/automaticas.ts`.
- **Fluxo 3 – Suporte e humano:** Chat ao vivo (`/api/chat/*`) → pausa de 10 min; `chamar_atendente` → trava sem prazo; Central de Tarefas.
- **Fluxo 4 – Automações operacionais:** campanhas (Tick), follow-up, `verificar_pedidos_atrasados` (a cada 15 min).
- **Fluxo 5 – Controle e recuperação:** `recuperar_atendimentos_ia` (22h), painel Operações, `conversa_eventos_ia`, `rotinas_execucoes`.
