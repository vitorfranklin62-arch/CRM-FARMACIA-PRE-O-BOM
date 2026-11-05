import Link from "next/link";
import { Activity, AlertTriangle, Ban, Bot, CalendarClock, Headset, PauseCircle, ShieldCheck, Timer, Workflow } from "lucide-react";
import { requireDona } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/utils";
import { ROTULOS_ESTADO, proximaExecucao22h, rotuloMotivo, type EstadoIa } from "@/lib/ia/estado";
import { RotinaRecuperacao } from "@/components/operacoes/RotinaRecuperacao";
import { MensagensAutomaticas } from "@/components/operacoes/MensagensAutomaticas";
import type { MensagemAutomatica, RotinaExecucao } from "@/types/database";

export const dynamic = "force-dynamic";

type Painel = {
  ativas: number;
  pausadas: number;
  com_humano: number;
  com_humano_manual: number;
  bloqueadas: number;
  sem_resposta: number;
};

function descreverAtor(ator: string | null) {
  if (!ator) return "sistema";
  if (ator.startsWith("usuario:")) return "equipe";
  return ({ ia: "IA", n8n: "N8N", cron: "agendador", sistema: "sistema", migracao: "migração" } as Record<string, string>)[ator] ?? ator;
}

export default async function OperacoesPage() {
  await requireDona();
  // Tudo aqui é leitura agregada pra dona (a página já exige a dona). As
  // funções do banco usadas são fechadas pra chave pública.
  const supabase = createServiceClient();
  const inicioDoDia = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" }) + "T00:00:00-03:00").toISOString();

  const [painelRes, execRes, eventosRes, tarefasRes, mensagensRes, avisosRes, notifRes] = await Promise.all([
    supabase.rpc("painel_operacoes_ia"),
    supabase.from("rotinas_execucoes").select("*").order("iniciada_em", { ascending: false }).limit(10),
    supabase.from("conversa_eventos_ia").select("*").order("criado_em", { ascending: false }).limit(40),
    supabase.from("tarefas").select("status, origem, criado_em, categoria").gte("criado_em", new Date(Date.now() - 7 * 86_400_000).toISOString()),
    supabase.from("mensagens_automaticas").select("*").order("chave"),
    supabase.from("configuracoes").select("valor").eq("chave", "notificacoes_pedido_ativas").maybeSingle(),
    supabase.from("pedido_notificacoes").select("status, criado_em").gte("criado_em", inicioDoDia),
  ]);

  const migracaoPendente = !!painelRes.error;
  const painel = (painelRes.data ?? null) as Painel | null;
  const execucoes = (execRes.data ?? []) as RotinaExecucao[];
  const ultimaAgendada = execucoes.find((e) => e.origem === "agendada");
  const ultima = execucoes[0];
  const eventos = eventosRes.data ?? [];

  // Nome do cliente de cada evento (uma consulta só).
  const idsConversa = Array.from(new Set(eventos.map((e) => e.conversa_id)));
  const { data: conversas } = idsConversa.length
    ? await supabase.from("conversas").select("id, clientes(nome)").in("id", idsConversa)
    : { data: [] as { id: string; clientes: { nome: string } | { nome: string }[] | null }[] };
  const nomePorConversa = new Map(
    (conversas ?? []).map((c) => [c.id, (Array.isArray(c.clientes) ? c.clientes[0]?.nome : c.clientes?.nome) ?? "Cliente"])
  );

  const tarefas = tarefasRes.data ?? [];
  const tarefasAutomaticasHoje = tarefas.filter((t) => t.origem !== "manual" && t.criado_em >= inicioDoDia).length;
  const tarefasAbertas = tarefas.filter((t) => t.status !== "CONCLUIDA" && t.status !== "CANCELADA").length;
  const notificacoes = notifRes.data ?? [];
  const proxima = proximaExecucao22h();
  const agendadorSemSinal = !ultimaAgendada || Date.now() - Date.parse(ultimaAgendada.iniciada_em) > 26 * 3_600_000;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-900 via-navy-800 to-brand-600 px-5 py-6 text-white shadow-card-md">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
        <div className="relative flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Activity size={22} />
          </span>
          <div>
            <h1 className="text-xl font-bold">Operações da IA e automações</h1>
            <p className="text-sm text-white/80">
              Onde a IA está atendendo, onde está pausada e por quê — e o que as automações fizeram sozinhas.
            </p>
          </div>
        </div>
      </div>

      {migracaoPendente && (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20">
          Este painel precisa das migrações de 05/11/2026. Rode no SQL editor do Supabase, nesta ordem:{" "}
          <code className="font-mono">20261105_central_tarefas.sql</code>,{" "}
          <code className="font-mono">20261105_ia_estado_e_recuperacao_22h.sql</code> e{" "}
          <code className="font-mono">20261105_mensagens_automaticas_pedidos.sql</code>.
        </p>
      )}

      {painel && (
        <section aria-label="Monitor da IA" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Kpi rotulo="IA atendendo" valor={painel.ativas} icone={<Bot size={16} />} cor="text-brand-600" />
          <Kpi rotulo="Pausadas (voltam sozinhas)" valor={painel.pausadas} icone={<PauseCircle size={16} />} cor="text-violet-600" />
          <Kpi
            rotulo="Com atendente"
            valor={painel.com_humano}
            detalhe={painel.com_humano_manual ? `${painel.com_humano_manual} travadas pelo botão` : undefined}
            icone={<Headset size={16} />}
            cor="text-amber-600"
          />
          <Kpi rotulo="Números bloqueados" valor={painel.bloqueadas} icone={<Ban size={16} />} cor="text-red-600" />
          <Kpi
            rotulo="Cliente sem resposta (+15 min)"
            valor={painel.sem_resposta}
            detalhe="IA ativa, mas ninguém respondeu"
            icone={<AlertTriangle size={16} />}
            cor={painel.sem_resposta > 0 ? "text-red-600" : "text-emerald-600"}
            destaque={painel.sem_resposta > 0}
          />
          <Kpi rotulo="Tarefas abertas (7 dias)" valor={tarefasAbertas} detalhe={`${tarefasAutomaticasHoje} abertas pela IA/automação hoje`} icone={<Workflow size={16} />} cor="text-brand-600" />
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card comFaixa>
          <CardHeader
            title="Rotina das 22h — reativação da IA"
            description="Todo dia às 22:00 (horário de Salvador) a IA volta a atender as conversas pausadas, transferidas ou travadas sem motivo. Números bloqueados e conversas travadas pelo botão ficam como estão. Nenhuma mensagem é enviada ao cliente."
          />
          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
            <Info icone={<CalendarClock size={14} />} rotulo="Próxima execução" valor={formatDateTime(proxima.toISOString())} />
            <Info
              icone={<Timer size={14} />}
              rotulo="Última execução"
              valor={ultima ? `${formatDateTime(ultima.iniciada_em)} (${ultima.origem === "agendada" ? "agendada" : "manual"})` : "Nenhuma ainda"}
            />
            <Info
              icone={<ShieldCheck size={14} />}
              rotulo="Reativadas na última"
              valor={ultima?.resultado && "reativadas" in ultima.resultado ? String(ultima.resultado.reativadas) : "—"}
            />
            <Info
              icone={<AlertTriangle size={14} />}
              rotulo="Falhas na última"
              valor={ultima ? (ultima.status === "falhou" ? "1 (ver abaixo)" : "0") : "—"}
            />
          </dl>
          {agendadorSemSinal && !migracaoPendente && (
            <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              Nenhuma execução <strong>agendada</strong> nas últimas 26h. Se a migração acabou de ser rodada, é normal até as 22h de hoje.
              Depois disso, confira se o pg_cron está ativo (Supabase → Database → Extensions) ou configure o plano B no N8N
              (ver <code>docs/n8n-ajustes.md</code>).
            </p>
          )}
          <RotinaRecuperacao desabilitado={migracaoPendente} />
          {execucoes.length > 0 && (
            <ul className="mt-4 divide-y divide-gray-100 text-xs dark:divide-white/10">
              {execucoes.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-mono text-gray-500">{formatDateTime(e.iniciada_em)}</span>
                  <span className="text-gray-600 dark:text-gray-300">
                    {e.origem === "agendada" ? "Agendada" : "Manual"} · por {descreverAtor(e.ator)}
                  </span>
                  <Badge variant={e.status === "concluida" ? "green" : e.status === "falhou" ? "red" : "yellow"}>
                    {e.status === "concluida"
                      ? `${(e.resultado as { reativadas?: number } | null)?.reativadas ?? 0} reativadas`
                      : e.status === "falhou"
                        ? "Falhou"
                        : "Executando"}
                  </Badge>
                  {e.erro && <span className="w-full text-red-600 dark:text-red-400">Erro: {e.erro}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card comFaixa>
          <CardHeader
            title="Central de automações"
            description="O que roda sozinho e quando."
            action={
              <Link href="/tarefas" className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300">
                Ver tarefas →
              </Link>
            }
          />
          <ul className="space-y-3 text-sm">
            <Automacao
              nome="Reativação da IA"
              quando="Todo dia às 22:00 e 22:30 (a segunda só age se a primeira falhar)"
              status={agendadorSemSinal ? "Sem execução agendada recente" : "Funcionando"}
              ok={!agendadorSemSinal}
            />
            <Automacao
              nome="Pedido atrasado → tarefa"
              quando="A cada 15 min: pedido parado em “pronto pra separar”/“separando” há mais de 90 min vira tarefa; fecha sozinha quando o pedido anda"
              status={`${tarefas.filter((t) => t.categoria === "pedido_atrasado" && t.criado_em >= inicioDoDia).length} hoje`}
              ok
            />
            <Automacao
              nome="Pausa vencida → IA volta"
              quando="Na hora: quando a pausa de quem respondeu pelo chat termina, a próxima mensagem do cliente já é atendida pela IA"
              status="Contínua"
              ok
            />
            <Automacao
              nome="Avisos de pedido e encomenda ao cliente"
              quando="Quando a equipe move o cartão (separando, pronto, finalizado) ou marca a encomenda como chegou"
              status={
                avisosRes.data?.valor === "true"
                  ? `Ligado · hoje: ${notificacoes.filter((n) => n.status === "enviada").length} enviados, ${notificacoes.filter((n) => n.status === "falhou").length} falhas`
                  : "Avisos de pedido desligados (encomenda continua avisando)"
              }
              ok={avisosRes.data?.valor === "true"}
            />
          </ul>
        </Card>
      </div>

      <Card comFaixa>
        <CardHeader
          title="Mensagens automáticas"
          description="Os textos que o sistema manda sozinho. Edite aqui sem mexer no código — as variáveis entre chaves são trocadas pelos dados reais."
        />
        {mensagensRes.error ? (
          <p className="text-sm text-gray-500">Disponível depois da migração 20261105_mensagens_automaticas_pedidos.sql.</p>
        ) : (
          <MensagensAutomaticas mensagens={(mensagensRes.data ?? []) as MensagemAutomatica[]} avisosPedidoLigados={avisosRes.data?.valor === "true"} />
        )}
      </Card>

      <Card comFaixa>
        <CardHeader title="Histórico de estados da IA" description="As últimas mudanças: quem pausou, travou, liberou ou reativou a IA em cada conversa, e por quê." />
        {eventos.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma mudança registrada ainda.</p>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-gray-400">
                <tr>
                  <th className="py-2 font-semibold">Quando</th>
                  <th className="py-2 font-semibold">Cliente</th>
                  <th className="py-2 font-semibold">Mudança</th>
                  <th className="py-2 font-semibold">Motivo</th>
                  <th className="py-2 font-semibold">Quem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {eventos.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2 font-mono text-gray-500">{formatDateTime(e.criado_em)}</td>
                    <td className="py-2">
                      <Link href={`/chat/${e.conversa_id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                        {nomePorConversa.get(e.conversa_id) ?? "Cliente"}
                      </Link>
                    </td>
                    <td className="py-2 text-gray-700 dark:text-gray-200">
                      {e.estado_anterior ? `${ROTULOS_ESTADO[e.estado_anterior as EstadoIa] ?? e.estado_anterior} → ` : ""}
                      <strong>{ROTULOS_ESTADO[e.estado_novo as EstadoIa] ?? e.estado_novo}</strong>
                    </td>
                    <td className="py-2 text-gray-600 dark:text-gray-300">{rotuloMotivo(e.motivo)}</td>
                    <td className="py-2 text-gray-500">{descreverAtor(e.ator)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({
  rotulo,
  valor,
  detalhe,
  icone,
  cor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  detalhe?: string;
  icone: React.ReactNode;
  cor: string;
  destaque?: boolean;
}) {
  return (
    <Card className={destaque ? "p-4 ring-2 ring-red-300 dark:ring-red-500/40" : "p-4"}>
      <div className={`mb-1 flex items-center gap-1.5 text-xs font-semibold ${cor}`}>
        {icone}
        <span className="text-gray-500 dark:text-gray-400">{rotulo}</span>
      </div>
      <p className="font-mono text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{valor}</p>
      {detalhe && <p className="mt-0.5 text-[11px] text-gray-400">{detalhe}</p>}
    </Card>
  );
}

function Info({ icone, rotulo, valor }: { icone: React.ReactNode; rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-brand-50/60 p-3 dark:bg-white/5">
      <dt className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        {icone} {rotulo}
      </dt>
      <dd className="mt-0.5 font-semibold text-gray-900 dark:text-white">{valor}</dd>
    </div>
  );
}

function Automacao({ nome, quando, status, ok }: { nome: string; quando: string; status: string; ok: boolean }) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-xl bg-gray-50/80 p-3 dark:bg-white/5">
      <div className="min-w-0">
        <p className="font-semibold text-gray-900 dark:text-white">{nome}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{quando}</p>
      </div>
      <Badge variant={ok ? "green" : "yellow"} comBolinha className="shrink-0">
        {status}
      </Badge>
    </li>
  );
}
