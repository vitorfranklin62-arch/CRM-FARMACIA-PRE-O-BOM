"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  History,
  Lightbulb,
  MessageCircle,
  Play,
  Plus,
  Search,
  User,
  Workflow,
  XCircle,
  Hourglass,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import type { Tarefa, TarefaCategoria, TarefaHistorico, TarefaPrioridade, TarefaStatus } from "@/types/database";

export type TarefaDaLista = Tarefa & { clientes: { nome: string; telefone: string } | null };
type Membro = { id: string; nome: string };

const STATUS: Record<TarefaStatus, { rotulo: string; variante: "blue" | "yellow" | "purple" | "green" | "gray" | "red" }> = {
  PENDENTE: { rotulo: "Pendente", variante: "yellow" },
  EM_ANDAMENTO: { rotulo: "Em andamento", variante: "blue" },
  AGUARDANDO_CLIENTE: { rotulo: "Aguardando cliente", variante: "purple" },
  AGUARDANDO_APROVACAO: { rotulo: "Aguardando aprovação", variante: "purple" },
  CONCLUIDA: { rotulo: "Concluída", variante: "green" },
  CANCELADA: { rotulo: "Cancelada", variante: "gray" },
};

const PRIORIDADE: Record<TarefaPrioridade, { rotulo: string; variante: "red" | "yellow" | "blue" | "gray"; peso: number }> = {
  urgente: { rotulo: "Urgente", variante: "red", peso: 0 },
  alta: { rotulo: "Alta", variante: "yellow", peso: 1 },
  media: { rotulo: "Média", variante: "blue", peso: 2 },
  baixa: { rotulo: "Baixa", variante: "gray", peso: 3 },
};

const CATEGORIA: Record<TarefaCategoria, string> = {
  pedido_atrasado: "Pedido atrasado",
  produto_indisponivel: "Produto em falta",
  reclamacao: "Reclamação",
  pagamento_pendente: "Pagamento pendente",
  erro_integracao: "Erro de integração",
  atendimento: "Atendimento",
  estoque: "Estoque",
  outro: "Outro",
};

const ORIGEM = { ia: "IA", automacao: "Automação", sistema: "Sistema", manual: "Equipe" } as const;

const FECHADAS: TarefaStatus[] = ["CONCLUIDA", "CANCELADA"];
const aberta = (t: Tarefa) => !FECHADAS.includes(t.status);
const vencida = (t: Tarefa, agora: number) => aberta(t) && !!t.prazo && Date.parse(t.prazo) < agora;

/** "AAAA-MM-DDTHH:mm" do campo datetime-local, entendido como horário de Salvador. */
function prazoParaIso(valor: string): string | null {
  return valor ? `${valor}:00-03:00` : null;
}

export function CentralTarefas({
  tarefasIniciais,
  equipe,
  usuarioId,
}: {
  tarefasIniciais: TarefaDaLista[];
  equipe: Membro[];
  usuarioId: string;
}) {
  const router = useRouter();
  const [tarefas, setTarefas] = useState(tarefasIniciais);
  const [filtroStatus, setFiltroStatus] = useState<"abertas" | "minhas" | "vencidas" | "fechadas" | "todas">("abertas");
  const [filtroPrioridade, setFiltroPrioridade] = useState<TarefaPrioridade | "">("");
  const [filtroResponsavel, setFiltroResponsavel] = useState("");
  const [busca, setBusca] = useState("");
  const [novaAberta, setNovaAberta] = useState(false);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => setTarefas(tarefasIniciais), [tarefasIniciais]);
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Tarefa nova da IA/automação aparece sozinha (Realtime).
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel("tarefas-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tarefas" }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [router]);

  const nomeMembro = useMemo(() => new Map(equipe.map((m) => [m.id, m.nome])), [equipe]);

  const indicadores = useMemo(() => {
    const abertas = tarefas.filter(aberta);
    const inicioDoDia = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" }) + "T00:00:00-03:00").getTime();
    return {
      abertas: abertas.length,
      urgentes: abertas.filter((t) => t.prioridade === "urgente" || t.prioridade === "alta").length,
      vencidas: abertas.filter((t) => vencida(t, agora)).length,
      automaticasHoje: tarefas.filter((t) => t.origem !== "manual" && Date.parse(t.criado_em) >= inicioDoDia).length,
      concluidasHoje: tarefas.filter((t) => t.status === "CONCLUIDA" && t.concluida_em && Date.parse(t.concluida_em) >= inicioDoDia).length,
    };
  }, [tarefas, agora]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase().replace(/^#/, "");
    return tarefas
      .filter((t) => {
        if (filtroStatus === "abertas" && !aberta(t)) return false;
        if (filtroStatus === "minhas" && (!aberta(t) || t.responsavel_id !== usuarioId)) return false;
        if (filtroStatus === "vencidas" && !vencida(t, agora)) return false;
        if (filtroStatus === "fechadas" && aberta(t)) return false;
        if (filtroPrioridade && t.prioridade !== filtroPrioridade) return false;
        if (filtroResponsavel === "sem" && t.responsavel_id) return false;
        if (filtroResponsavel && filtroResponsavel !== "sem" && t.responsavel_id !== filtroResponsavel) return false;
        if (!termo) return true;
        return [String(t.numero), t.titulo, t.descricao, t.observacoes, t.clientes?.nome, CATEGORIA[t.categoria]]
          .filter(Boolean)
          .some((campo) => String(campo).toLowerCase().includes(termo));
      })
      .sort((a, b) => {
        if (aberta(a) !== aberta(b)) return aberta(a) ? -1 : 1;
        const peso = PRIORIDADE[a.prioridade].peso - PRIORIDADE[b.prioridade].peso;
        return peso !== 0 ? peso : Date.parse(b.criado_em) - Date.parse(a.criado_em);
      });
  }, [tarefas, filtroStatus, filtroPrioridade, filtroResponsavel, busca, usuarioId, agora]);

  async function atualizar(t: TarefaDaLista, mudanca: Partial<Pick<Tarefa, "status" | "prioridade" | "responsavel_id" | "observacoes">>) {
    setSalvandoId(t.id);
    setErro(null);
    const anterior = t;
    setTarefas((lista) => lista.map((x) => (x.id === t.id ? { ...x, ...mudanca } : x)));
    try {
      const res = await fetch(`/api/tarefas/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mudanca),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Não foi possível atualizar a tarefa.");
    } catch (e) {
      setTarefas((lista) => lista.map((x) => (x.id === t.id ? anterior : x)));
      setErro(e instanceof Error ? e.message : "Não foi possível atualizar a tarefa.");
    }
    setSalvandoId(null);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Indicador rotulo="Abertas" valor={indicadores.abertas} icone={<Clock size={16} />} />
        <Indicador rotulo="Alta / urgente" valor={indicadores.urgentes} icone={<AlertTriangle size={16} />} destaque={indicadores.urgentes > 0} />
        <Indicador rotulo="Vencidas (SLA)" valor={indicadores.vencidas} icone={<Hourglass size={16} />} destaque={indicadores.vencidas > 0} />
        <Indicador rotulo="Abertas pela IA/automação hoje" valor={indicadores.automaticasHoje} icone={<Bot size={16} />} />
        <Indicador rotulo="Concluídas hoje" valor={indicadores.concluidasHoje} icone={<CheckCircle2 size={16} />} />
      </div>

      <Card className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar tarefas">
            {(
              [
                ["abertas", "Abertas"],
                ["minhas", "Minhas"],
                ["vencidas", "Vencidas"],
                ["fechadas", "Concluídas/canceladas"],
                ["todas", "Todas"],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                role="tab"
                aria-selected={filtroStatus === valor}
                onClick={() => setFiltroStatus(valor)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-xs font-semibold transition",
                  filtroStatus === valor
                    ? "bg-brand-600 text-white shadow-card"
                    : "bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="relative">
              <span className="sr-only">Buscar</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar (título, cliente, #número)" className="pl-9" />
            </label>
            <Select value={filtroPrioridade} onChange={(e) => setFiltroPrioridade(e.target.value as TarefaPrioridade | "")} aria-label="Prioridade">
              <option value="">Todas as prioridades</option>
              {(Object.keys(PRIORIDADE) as TarefaPrioridade[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORIDADE[p].rotulo}
                </option>
              ))}
            </Select>
            <Select value={filtroResponsavel} onChange={(e) => setFiltroResponsavel(e.target.value)} aria-label="Responsável">
              <option value="">Qualquer responsável</option>
              <option value="sem">Sem responsável</option>
              {equipe.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </Select>
          </div>
          <Button onClick={() => setNovaAberta(true)} className="shrink-0">
            <Plus size={16} /> Nova tarefa
          </Button>
        </div>
        {erro && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {erro}
          </p>
        )}
      </Card>

      {visiveis.length === 0 ? (
        <Card className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          Nenhuma tarefa neste filtro. {filtroStatus === "abertas" && "Tudo em dia por aqui. 💚"}
        </Card>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {visiveis.map((t) => (
            <CartaoTarefa
              key={t.id}
              tarefa={t}
              agora={agora}
              equipe={equipe}
              nomeResponsavel={t.responsavel_id ? (nomeMembro.get(t.responsavel_id) ?? "—") : null}
              salvando={salvandoId === t.id}
              aoAtualizar={(m) => atualizar(t, m)}
            />
          ))}
        </ul>
      )}

      <NovaTarefaModal
        open={novaAberta}
        onClose={() => setNovaAberta(false)}
        equipe={equipe}
        aoCriar={() => {
          setNovaAberta(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function Indicador({ rotulo, valor, icone, destaque }: { rotulo: string; valor: number; icone: React.ReactNode; destaque?: boolean }) {
  return (
    <Card className={cn("flex items-center gap-3 p-4", destaque && "ring-2 ring-accent-300 dark:ring-accent-500/40")}>
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          destaque ? "bg-accent-100 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300" : "bg-brand-50 text-brand-700 dark:bg-white/10 dark:text-brand-100"
        )}
      >
        {icone}
      </span>
      <div className="min-w-0">
        <p className="font-mono text-xl font-bold tabular-nums text-gray-900 dark:text-white">{valor}</p>
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{rotulo}</p>
      </div>
    </Card>
  );
}

function CartaoTarefa({
  tarefa: t,
  agora,
  equipe,
  nomeResponsavel,
  salvando,
  aoAtualizar,
}: {
  tarefa: TarefaDaLista;
  agora: number;
  equipe: Membro[];
  nomeResponsavel: string | null;
  salvando: boolean;
  aoAtualizar: (m: Partial<Pick<Tarefa, "status" | "prioridade" | "responsavel_id" | "observacoes">>) => void;
}) {
  const [historico, setHistorico] = useState<TarefaHistorico[] | null>(null);
  const [verHistorico, setVerHistorico] = useState(false);
  const estaAberta = aberta(t);
  const atrasada = vencida(t, agora);

  async function alternarHistorico() {
    const abrir = !verHistorico;
    setVerHistorico(abrir);
    if (abrir && !historico) {
      const supabase = createClient();
      const { data } = await supabase
        .from("tarefa_historico")
        .select("*")
        .eq("tarefa_id", t.id)
        .order("criado_em", { ascending: false })
        .limit(30);
      setHistorico(data ?? []);
    }
  }

  return (
    <li>
      <Card className={cn("space-y-3 p-4", !estaAberta && "opacity-70", atrasada && "ring-2 ring-red-300 dark:ring-red-500/40")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500">
              <span className="font-mono">#{t.numero}</span>·<span>{CATEGORIA[t.categoria]}</span>·
              <span className="inline-flex items-center gap-1">
                {t.origem === "manual" ? <User size={11} /> : t.origem === "ia" ? <Bot size={11} /> : <Workflow size={11} />}
                {ORIGEM[t.origem]}
              </span>
            </p>
            <h3 className="mt-0.5 text-sm font-bold text-gray-900 dark:text-white">{t.titulo}</h3>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant={STATUS[t.status].variante} comBolinha>
              {STATUS[t.status].rotulo}
            </Badge>
            <Badge variant={PRIORIDADE[t.prioridade].variante}>{PRIORIDADE[t.prioridade].rotulo}</Badge>
          </div>
        </div>

        {t.descricao && <p className="whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">{t.descricao}</p>}

        {t.sugestao_ia && estaAberta && (
          <p className="flex gap-2 rounded-xl bg-brand-50/80 px-3 py-2 text-xs text-brand-800 ring-1 ring-inset ring-brand-100 dark:bg-white/5 dark:text-brand-100 dark:ring-white/10">
            <Lightbulb size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong>Próximo passo sugerido:</strong> {t.sugestao_ia}
            </span>
          </p>
        )}

        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          {t.clientes && (
            <div>
              <dt className="inline">Cliente: </dt>
              <dd className="inline font-medium text-gray-700 dark:text-gray-200">{t.clientes.nome}</dd>
            </div>
          )}
          <div>
            <dt className="inline">Aberta </dt>
            <dd className="inline">{formatRelativeTime(t.criado_em)}</dd>
          </div>
          {t.prazo && (
            <div className={cn(atrasada && "font-semibold text-red-600 dark:text-red-400")}>
              <dt className="inline">Prazo: </dt>
              <dd className="inline">
                {formatDateTime(t.prazo)}
                {atrasada && " (vencido)"}
              </dd>
            </div>
          )}
        </dl>

        {t.observacoes && (
          <p className="whitespace-pre-line rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">{t.observacoes}</p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3 dark:border-white/10">
          {estaAberta ? (
            <>
              {t.status !== "EM_ANDAMENTO" && (
                <Button size="sm" variant="secondary" disabled={salvando} onClick={() => aoAtualizar({ status: "EM_ANDAMENTO" })}>
                  <Play size={13} /> Iniciar
                </Button>
              )}
              {t.status !== "AGUARDANDO_CLIENTE" && (
                <Button size="sm" variant="ghost" disabled={salvando} onClick={() => aoAtualizar({ status: "AGUARDANDO_CLIENTE" })}>
                  Aguardando cliente
                </Button>
              )}
              <Button size="sm" variant="success" disabled={salvando} onClick={() => aoAtualizar({ status: "CONCLUIDA" })}>
                <CheckCircle2 size={13} /> Concluir
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={salvando}
                onClick={() => {
                  if (confirm(`Cancelar a tarefa #${t.numero}? Ela continua no histórico.`)) aoAtualizar({ status: "CANCELADA" });
                }}
              >
                <XCircle size={13} /> Cancelar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" disabled={salvando} onClick={() => aoAtualizar({ status: "PENDENTE" })}>
              Reabrir
            </Button>
          )}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
            <span className="sr-only sm:not-sr-only">Responsável</span>
            <Select
              value={t.responsavel_id ?? ""}
              disabled={salvando}
              onChange={(e) => aoAtualizar({ responsavel_id: e.target.value || null })}
              className="w-36 py-1 text-xs"
              title={nomeResponsavel ? `Responsável: ${nomeResponsavel}` : "Sem responsável"}
            >
              <option value="">Sem responsável</option>
              {equipe.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div className="flex flex-wrap gap-3 text-xs">
          {t.conversa_id && (
            <Link href={`/chat/${t.conversa_id}`} className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline dark:text-brand-300">
              <MessageCircle size={13} /> Abrir conversa
            </Link>
          )}
          {t.pedido_id && (
            <Link href="/pedidos" className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline dark:text-brand-300">
              Ver quadro de pedidos
            </Link>
          )}
          <button type="button" onClick={alternarHistorico} className="inline-flex items-center gap-1 font-semibold text-gray-500 hover:text-brand-600">
            <History size={13} /> {verHistorico ? "Esconder histórico" : "Histórico"}
          </button>
        </div>

        {verHistorico && (
          <ol className="space-y-1 border-l-2 border-brand-100 pl-3 text-xs text-gray-500 dark:border-white/10 dark:text-gray-400">
            {historico === null ? (
              <li>Carregando…</li>
            ) : historico.length === 0 ? (
              <li>Sem registros.</li>
            ) : (
              historico.map((h) => (
                <li key={h.id}>
                  <span className="font-mono">{formatDateTime(h.criado_em)}</span> — {descreverHistorico(h, equipe)}
                </li>
              ))
            )}
          </ol>
        )}
      </Card>
    </li>
  );
}

function descreverAtor(ator: string | null, equipe: Membro[]) {
  if (!ator) return "sistema";
  if (ator.startsWith("usuario:")) return equipe.find((m) => m.id === ator.slice(8))?.nome ?? "equipe";
  return ({ ia: "IA", automacao: "automação", sistema: "sistema" } as Record<string, string>)[ator] ?? ator;
}

function descreverHistorico(h: TarefaHistorico, equipe: Membro[]) {
  const quem = descreverAtor(h.ator, equipe);
  if (h.acao === "criada") return `criada por ${quem}`;
  if (h.acao === "status")
    return `${quem}: ${STATUS[h.de as TarefaStatus]?.rotulo ?? h.de} → ${STATUS[h.para as TarefaStatus]?.rotulo ?? h.para}`;
  if (h.acao === "responsavel") {
    const para = h.para ? (equipe.find((m) => m.id === h.para)?.nome ?? "—") : "ninguém";
    return `${quem} passou para ${para}`;
  }
  if (h.acao === "prioridade") return `${quem} mudou a prioridade para ${PRIORIDADE[h.para as TarefaPrioridade]?.rotulo ?? h.para}`;
  if (h.acao === "observacao") return `${quem} atualizou as observações`;
  return `${quem}: ${h.acao}`;
}

function NovaTarefaModal({
  open,
  onClose,
  equipe,
  aoCriar,
}: {
  open: boolean;
  onClose: () => void;
  equipe: Membro[];
  aoCriar: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSalvando(true);
    setErro(null);
    const res = await fetch("/api/tarefas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: String(f.get("titulo") ?? ""),
        descricao: String(f.get("descricao") ?? "") || null,
        categoria: f.get("categoria"),
        prioridade: f.get("prioridade"),
        responsavel_id: String(f.get("responsavel_id") ?? "") || null,
        prazo: prazoParaIso(String(f.get("prazo") ?? "")),
      }),
    }).catch(() => null);
    setSalvando(false);
    if (!res?.ok) {
      setErro((await res?.json().catch(() => null))?.error ?? "Não foi possível criar a tarefa.");
      return;
    }
    aoCriar();
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova tarefa">
      <form onSubmit={enviar} className="space-y-3">
        <div>
          <Label htmlFor="t-titulo">Título</Label>
          <Input id="t-titulo" name="titulo" required minLength={3} maxLength={200} placeholder="Ex.: Ligar para cliente sobre a entrega" />
        </div>
        <div>
          <Label htmlFor="t-descricao">Descrição</Label>
          <Textarea id="t-descricao" name="descricao" rows={3} maxLength={4000} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="t-categoria">Categoria</Label>
            <Select id="t-categoria" name="categoria" defaultValue="atendimento">
              {(Object.keys(CATEGORIA) as TarefaCategoria[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA[c]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="t-prioridade">Prioridade</Label>
            <Select id="t-prioridade" name="prioridade" defaultValue="media">
              {(Object.keys(PRIORIDADE) as TarefaPrioridade[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORIDADE[p].rotulo}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="t-responsavel">Responsável</Label>
            <Select id="t-responsavel" name="responsavel_id" defaultValue="">
              <option value="">Ninguém ainda</option>
              {equipe.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="t-prazo">Prazo (opcional)</Label>
            <Input id="t-prazo" name="prazo" type="datetime-local" />
          </div>
        </div>
        {erro && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {erro}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={salvando}>
            {salvando ? "Salvando…" : "Criar tarefa"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
