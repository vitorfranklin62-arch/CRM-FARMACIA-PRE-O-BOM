"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, MessageCircle, X, ShoppingBag, Wallet, CalendarClock, Megaphone, Tag as TagIcon, NotebookPen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency, formatRelativeTime } from "@/lib/utils";
import { formatarTelefone } from "@/lib/telefone";
import { logAudit } from "@/lib/audit";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import type { Tag, TagCor } from "@/types/database";
import type { ClienteComTags } from "@/types/relations";

/** Resumo de compras do cliente, calculado no servidor a partir de `pedidos`. */
export type ResumoPedidosCliente = {
  quantidade: number;
  totalGasto: number;
  ultimoPedidoEm: string | null;
};

// Etiquetas de um clique, comuns em farmácia. Viram tags normais (tabela
// `tags`) na primeira vez que alguém usa — a cor já vem escolhida.
const SUGESTOES: { nome: string; cor: TagCor }[] = [
  { nome: "vip", cor: "purple" },
  { nome: "reclamação", cor: "red" },
  { nome: "atacado", cor: "blue" },
  { nome: "novo", cor: "green" },
];

const chave = (nome: string) => nome.trim().toLowerCase();

/**
 * Ficha do cliente na lateral do Chat ao vivo: contato, resumo de pedidos,
 * se aceita promoções, etiquetas (tags) e anotações — tudo editável dali
 * mesmo, sem sair da conversa.
 */
export function FichaCliente({
  cliente,
  resumo,
  tagsDisponiveis,
  onFechar,
}: {
  cliente: ClienteComTags;
  resumo: ResumoPedidosCliente;
  tagsDisponiveis: Tag[];
  onFechar?: () => void;
}) {
  const router = useRouter();
  const [copiado, setCopiado] = useState(false);
  const [novaEtiqueta, setNovaEtiqueta] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erroEtiqueta, setErroEtiqueta] = useState<string | null>(null);
  const [anotacao, setAnotacao] = useState(cliente.observacoes ?? "");
  const [salvandoAnotacao, setSalvandoAnotacao] = useState(false);
  const [anotacaoSalva, setAnotacaoSalva] = useState(false);

  // Trocou de conversa/cliente (ou outra pessoa salvou): mostra a anotação atual.
  useEffect(() => setAnotacao(cliente.observacoes ?? ""), [cliente.id, cliente.observacoes]);

  const etiquetas = cliente.cliente_tags.filter((ct) => ct.tags);
  const nomesNoCliente = new Set(etiquetas.map((ct) => chave(ct.tags!.nome)));
  const sugestoes = [
    ...SUGESTOES.map((s) => s.nome),
    ...tagsDisponiveis.map((t) => t.nome),
  ].filter((nome, i, todos) => !nomesNoCliente.has(chave(nome)) && todos.findIndex((n) => chave(n) === chave(nome)) === i);

  async function copiarTelefone() {
    try {
      await navigator.clipboard.writeText(formatarTelefone(cliente.telefone));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Navegador sem permissão de área de transferência: nada a fazer.
    }
  }

  async function porEtiqueta(nome: string) {
    const limpo = nome.trim().slice(0, 40);
    if (!limpo || ocupado) return;
    if (nomesNoCliente.has(chave(limpo))) {
      setNovaEtiqueta("");
      return;
    }
    setOcupado(chave(limpo));
    setErroEtiqueta(null);
    const supabase = createClient();

    // Reaproveita a tag se já existir (nome único ignorando maiúsculas).
    let tagId = tagsDisponiveis.find((t) => chave(t.nome) === chave(limpo))?.id ?? null;
    if (!tagId) {
      const cor = SUGESTOES.find((s) => chave(s.nome) === chave(limpo))?.cor ?? "blue";
      const { data, error } = await supabase.from("tags").insert({ nome: limpo, cor }).select("id").single();
      if (data) {
        tagId = data.id;
      } else if (error?.code === "23505") {
        // Alguém criou a mesma tag agora há pouco — busca a que já existe.
        const { data: existentes } = await supabase.from("tags").select("id, nome").ilike("nome", limpo);
        tagId = existentes?.find((t) => chave(t.nome) === chave(limpo))?.id ?? null;
      }
    }

    if (!tagId) {
      setErroEtiqueta("Não foi possível criar a etiqueta.");
      setOcupado(null);
      return;
    }

    const { error } = await supabase.from("cliente_tags").insert({ cliente_id: cliente.id, tag_id: tagId });
    if (error && error.code !== "23505") {
      setErroEtiqueta("Não foi possível pôr a etiqueta.");
    } else {
      setNovaEtiqueta("");
    }
    router.refresh();
    setOcupado(null);
  }

  async function tirarEtiqueta(tagId: string) {
    if (ocupado) return;
    setOcupado(tagId);
    const supabase = createClient();
    await supabase.from("cliente_tags").delete().eq("cliente_id", cliente.id).eq("tag_id", tagId);
    router.refresh();
    setOcupado(null);
  }

  async function salvarAnotacao() {
    setSalvandoAnotacao(true);
    const supabase = createClient();
    const texto = anotacao.trim() || null;
    const { error } = await supabase.from("clientes").update({ observacoes: texto }).eq("id", cliente.id);
    if (!error) {
      await logAudit(supabase, "cliente_observacao_atualizada", "clientes", cliente.id, { origem: "chat" });
      setAnotacaoSalva(true);
      setTimeout(() => setAnotacaoSalva(false), 2000);
      router.refresh();
    } else {
      alert("Não foi possível salvar a anotação.");
    }
    setSalvandoAnotacao(false);
  }

  const anotacaoMudou = (anotacao.trim() || null) !== (cliente.observacoes?.trim() || null);

  return (
    <aside className="rolagem-fina flex h-full w-full flex-col gap-3 overflow-y-auto bg-gradient-to-b from-brand-50/70 to-white p-4 dark:from-brand-500/10 dark:to-navy-800/80">
      <div className="flex items-center justify-between">
        <h3 className="titulo-gradiente text-sm font-bold">Ficha do cliente</h3>
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            title="Fechar ficha"
            className="rounded-lg p-1 text-gray-400 transition hover:bg-brand-100 hover:text-brand-700 dark:hover:bg-white/10"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Contato */}
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 text-center shadow-card ring-1 ring-brand-100/70 dark:bg-white/5 dark:shadow-none dark:ring-white/10">
        <Avatar nome={cliente.nome} fotoUrl={cliente.foto_url} size={56} comAnel />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{cliente.nome}</p>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{formatarTelefone(cliente.telefone)}</p>
        </div>
        <div className="flex w-full gap-2">
          <button
            type="button"
            onClick={copiarTelefone}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-50 px-2 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200/70 transition hover:bg-brand-100 dark:bg-white/10 dark:text-brand-100 dark:ring-white/10"
          >
            {copiado ? <Check size={13} /> : <Copy size={13} />} {copiado ? "Copiado" : "Copiar"}
          </button>
          <a
            href={`https://wa.me/${cliente.telefone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradiente-sucesso px-2 py-1.5 text-xs font-semibold text-white shadow-brilho-sucesso transition hover:brightness-110"
          >
            <MessageCircle size={13} /> WhatsApp
          </a>
        </div>
      </div>

      {/* Números */}
      <div className="grid grid-cols-2 gap-2">
        <Indicador icone={ShoppingBag} rotulo="Pedidos" valor={String(resumo.quantidade)} />
        <Indicador icone={Wallet} rotulo="Já gastou" valor={formatCurrency(resumo.totalGasto)} />
        <Indicador
          icone={CalendarClock}
          rotulo="Último pedido"
          valor={resumo.ultimoPedidoEm ? formatRelativeTime(resumo.ultimoPedidoEm) : "—"}
        />
        <Indicador
          icone={Megaphone}
          rotulo="Promoções"
          valor={cliente.aceita_campanhas === false ? "Não aceitou" : "Aceita"}
          destaque={cliente.aceita_campanhas === false ? "text-accent-600 dark:text-accent-300" : "text-emerald-600 dark:text-emerald-400"}
        />
      </div>

      {/* Etiquetas */}
      <Secao icone={TagIcon} titulo="Etiquetas">
        <div className="flex flex-wrap gap-1.5">
          {etiquetas.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500">Nenhuma etiqueta ainda.</p>}
          {etiquetas.map((ct) => (
            <Badge key={ct.tag_id} variant={ct.tags!.cor} className="gap-1 pr-1 text-[11px]">
              {ct.tags!.nome}
              <button
                type="button"
                onClick={() => tirarEtiqueta(ct.tag_id)}
                disabled={ocupado === ct.tag_id}
                title={`Tirar "${ct.tags!.nome}"`}
                className="rounded-full p-0.5 opacity-60 transition hover:bg-black/10 hover:opacity-100 disabled:opacity-30"
              >
                <X size={10} />
              </button>
            </Badge>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            porEtiqueta(novaEtiqueta);
          }}
          className="mt-2.5 flex gap-1.5"
        >
          <input
            value={novaEtiqueta}
            onChange={(e) => setNovaEtiqueta(e.target.value)}
            placeholder="Nova etiqueta"
            maxLength={40}
            className="min-w-0 flex-1 rounded-xl border border-brand-200/70 bg-white px-2.5 py-1.5 text-xs text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:focus:ring-brand-500/25"
          />
          <button
            type="submit"
            disabled={!novaEtiqueta.trim() || !!ocupado}
            className="rounded-xl bg-gradiente-acento px-3 py-1.5 text-xs font-semibold text-white shadow-brilho-acento transition hover:brightness-110 disabled:bg-none disabled:bg-accent-200 disabled:shadow-none"
          >
            Pôr
          </button>
        </form>
        {sugestoes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {sugestoes.slice(0, 8).map((nome) => (
              <button
                key={chave(nome)}
                type="button"
                onClick={() => porEtiqueta(nome)}
                disabled={!!ocupado}
                className="rounded-full border border-dashed border-brand-200 px-2 py-0.5 text-[11px] font-medium text-brand-600 transition hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50 dark:border-white/15 dark:text-brand-200 dark:hover:bg-white/10"
              >
                + {nome}
              </button>
            ))}
          </div>
        )}
        {erroEtiqueta && <p className="mt-1.5 text-xs text-red-600">{erroEtiqueta}</p>}
      </Secao>

      {/* Anotações */}
      <Secao icone={NotebookPen} titulo="Anotações">
        <textarea
          value={anotacao}
          onChange={(e) => setAnotacao(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Ex.: alérgico a amendoim, entregar no portão de trás..."
          className="w-full resize-none rounded-xl border border-brand-200/70 bg-white px-2.5 py-2 text-xs text-gray-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 dark:border-white/10 dark:bg-white/5 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-brand-500/25"
        />
        <button
          type="button"
          onClick={salvarAnotacao}
          disabled={salvandoAnotacao || !anotacaoMudou}
          className={cn(
            "mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed",
            anotacaoSalva
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-200 dark:disabled:bg-white/10 dark:disabled:text-gray-500"
          )}
        >
          {anotacaoSalva ? (
            <>
              <Check size={13} /> Anotação salva
            </>
          ) : salvandoAnotacao ? (
            "Salvando..."
          ) : (
            "Salvar anotação"
          )}
        </button>
      </Secao>
    </aside>
  );
}

function Indicador({
  icone: Icone,
  rotulo,
  valor,
  destaque,
}: {
  icone: typeof Copy;
  rotulo: string;
  valor: string;
  destaque?: string;
}) {
  return (
    <div className="rounded-xl bg-white p-2.5 ring-1 ring-brand-100/70 dark:bg-white/5 dark:ring-white/10">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        <Icone size={11} /> {rotulo}
      </p>
      <p className={cn("mt-0.5 truncate text-sm font-bold text-gray-900 dark:text-white", destaque)}>{valor}</p>
    </div>
  );
}

function Secao({ icone: Icone, titulo, children }: { icone: typeof Copy; titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-3 ring-1 ring-brand-100/70 dark:bg-white/5 dark:ring-white/10">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-200">
        <Icone size={13} className="text-brand-500 dark:text-brand-300" /> {titulo}
      </h4>
      {children}
    </section>
  );
}
