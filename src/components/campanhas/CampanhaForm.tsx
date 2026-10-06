"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Label, Input, Textarea, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { campanhaCreateSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";
import type { ClientesAlvo, FiltroCampanha, OrigemChat, Tag } from "@/types/database";

type ClienteOpcao = { id: string; nome: string; telefone: string };
type Atividade = "" | "ativos" | "inativos";

export function CampanhaForm({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [clientesAlvo, setClientesAlvo] = useState<ClientesAlvo>("todos");
  const [origem, setOrigem] = useState<"" | OrigemChat>("");
  const [atividade, setAtividade] = useState<Atividade>("");
  const [dias, setDias] = useState("30");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [contatoIds, setContatoIds] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [tags, setTags] = useState<Pick<Tag, "id" | "nome">[]>([]);
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [previa, setPrevia] = useState<number | null>(null);
  const [agendadaPara, setAgendadaPara] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function reset() {
    setTitulo("");
    setMensagem("");
    setClientesAlvo("todos");
    setOrigem("");
    setAtividade("");
    setDias("30");
    setTagIds([]);
    setContatoIds([]);
    setBusca("");
    setAgendadaPara("");
    setError(null);
  }

  // Filtro montado a partir dos campos. Só entra o que foi preenchido — o
  // banco trata campo ausente como "sem restrição".
  const filtro = useMemo<FiltroCampanha>(() => {
    const f: FiltroCampanha = {};
    if (origem) f.origem_chat = origem;
    if (tagIds.length > 0) f.tag_ids = tagIds;
    if (contatoIds.length > 0) f.cliente_ids = contatoIds;
    const d = parseInt(dias, 10);
    if (atividade === "ativos" && d > 0) f.interagiu_ultimos_dias = d;
    if (atividade === "inativos" && d > 0) f.inativos_ha_dias = d;
    return f;
  }, [origem, tagIds, contatoIds, atividade, dias]);

  const semCriterio = Object.keys(filtro).length === 0;
  const filtroChave = JSON.stringify(filtro);

  // Opções do filtro (tags e lista de clientes) — carregadas só quando o
  // modal abre no modo "filtrar", pra não pesar a tela de Campanhas.
  useEffect(() => {
    if (!open || clientesAlvo !== "por_filtro" || clientes.length > 0) return;
    const supabase = createClient();
    supabase
      .from("clientes")
      .select("id, nome, telefone")
      .eq("aceita_campanhas", true)
      .order("nome")
      .limit(5000)
      .then(({ data }) => setClientes((data as ClienteOpcao[] | null) ?? []));
    supabase
      .from("tags")
      .select("id, nome")
      .order("nome")
      .then(({ data }) => setTags((data as Pick<Tag, "id" | "nome">[] | null) ?? []));
  }, [open, clientesAlvo, clientes.length]);

  // Prévia "quantos vão receber". Usa a MESMA função do banco que o N8N usa
  // no disparo, então o número aqui é o que será enviado de verdade.
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setPrevia(null);
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("filtrar_clientes_campanha", {
        filtro: clientesAlvo === "por_filtro" ? filtro : null,
      });
      if (!cancelado) setPrevia(rpcError ? null : (data?.length ?? 0));
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
    // filtroChave representa o conteúdo de `filtro`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientesAlvo, filtroChave]);

  const clientesVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, "");
    const lista = termo
      ? clientes.filter(
          (c) => c.nome.toLowerCase().includes(termo) || (digitos.length >= 3 && c.telefone.includes(digitos))
        )
      : clientes;
    return lista.slice(0, 100);
  }, [clientes, busca]);

  function alternar(lista: string[], id: string, definir: (v: string[]) => void) {
    definir(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (clientesAlvo === "por_filtro" && semCriterio) {
      setError("Escolha ao menos um critério de público, ou volte para “Todos os clientes”.");
      return;
    }
    if (previa === 0) {
      setError("Nenhum cliente corresponde a esse público. Ajuste o filtro.");
      return;
    }

    const parsed = campanhaCreateSchema.safeParse({
      titulo,
      mensagem,
      clientes_alvo: clientesAlvo,
      filtro_json: clientesAlvo === "por_filtro" ? filtro : null,
      agendada_para: agendadaPara ? new Date(agendadaPara).toISOString() : null,
    });

    if (!parsed.success) {
      setError("Preencha título e mensagem corretamente.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("campanhas")
      .insert({
        titulo: parsed.data.titulo,
        mensagem: parsed.data.mensagem,
        clientes_alvo: parsed.data.clientes_alvo,
        filtro_json: parsed.data.filtro_json ?? null,
        agendada_para: parsed.data.agendada_para,
        status: parsed.data.agendada_para ? "agendada" : "rascunho",
        criado_por: userId,
      })
      .select("id")
      .single();
    setSaving(false);

    if (dbError) {
      setError("Não foi possível criar a campanha.");
      return;
    }

    await logAudit(supabase, "campanha_criada", "campanhas", data?.id, {
      titulo: parsed.data.titulo,
    });

    reset();
    onClose();
    router.refresh();
  }

  const chip = (ativo: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs font-medium transition",
      ativo
        ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
        : "border-gray-200 text-gray-600 hover:border-brand-300 dark:border-white/10 dark:text-gray-300"
    );

  return (
    <Modal open={open} onClose={onClose} title="Nova campanha" size="xl">
      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label htmlFor="titulo">Título</Label>
              <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={200} />
            </div>

            <div>
              <Label htmlFor="mensagem">Mensagem</Label>
              <Textarea
                id="mensagem"
                rows={9}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                required
                maxLength={2000}
              />
            </div>

            <div>
              <Label htmlFor="agendada_para">Agendar envio (opcional)</Label>
              <Input
                id="agendada_para"
                type="datetime-local"
                value={agendadaPara}
                onChange={(e) => setAgendadaPara(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Público</Label>
            <Select value={clientesAlvo} onChange={(e) => setClientesAlvo(e.target.value as ClientesAlvo)}>
              <option value="todos">Todos os clientes</option>
              <option value="por_filtro">Filtrar quem vai receber</option>
            </Select>

            {clientesAlvo === "por_filtro" && (
              <div className="space-y-4 rounded-xl border border-gray-100 p-3 dark:border-white/10">
                <div>
                  <Label htmlFor="origem">Origem do contato</Label>
                  <Select id="origem" value={origem} onChange={(e) => setOrigem(e.target.value as "" | OrigemChat)}>
                    <option value="">Qualquer</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="instagram">Instagram</option>
                  </Select>
                </div>

                <div>
                  <Label>Última conversa com a farmácia</Label>
                  <div className="flex gap-2">
                    <Select value={atividade} onChange={(e) => setAtividade(e.target.value as Atividade)}>
                      <option value="">Qualquer</option>
                      <option value="ativos">Falaram comigo nos últimos…</option>
                      <option value="inativos">Sem falar comigo há mais de…</option>
                    </Select>
                    {atividade !== "" && (
                      <div className="flex w-32 shrink-0 items-center gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          max={3650}
                          value={dias}
                          onChange={(e) => setDias(e.target.value)}
                          aria-label="Quantidade de dias"
                        />
                        <span className="text-sm text-gray-500">dias</span>
                      </div>
                    )}
                  </div>
                </div>

                {tags.length > 0 && (
                  <div>
                    <Label>Tags (quem tem qualquer uma)</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => alternar(tagIds, t.id, setTagIds)}
                          className={chip(tagIds.includes(t.id))}
                        >
                          {t.nome}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <Label htmlFor="busca">Escolher contatos específicos</Label>
                    {contatoIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setContatoIds([])}
                        className="text-xs font-medium text-brand-600 hover:underline"
                      >
                        Limpar ({contatoIds.length})
                      </button>
                    )}
                  </div>
                  <Input
                    id="busca"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por nome ou telefone"
                  />
                  <div className="mt-2 max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100 dark:divide-white/5 dark:border-white/10">
                    {clientesVisiveis.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400">
                        {clientes.length === 0 ? "Carregando…" : "Nenhum contato encontrado."}
                      </p>
                    ) : (
                      clientesVisiveis.map((c) => (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-white/5"
                        >
                          <input
                            type="checkbox"
                            checked={contatoIds.includes(c.id)}
                            onChange={() => alternar(contatoIds, c.id, setContatoIds)}
                          />
                          <span className="truncate text-gray-800 dark:text-gray-100">{c.nome}</span>
                          <span className="ml-auto shrink-0 text-xs text-gray-400">{c.telefone}</span>
                        </label>
                      ))
                    )}
                  </div>
                  {!busca && clientes.length > 100 && (
                    <p className="mt-1 text-xs text-gray-400">
                      Mostrando os 100 primeiros — use a busca para achar os outros.
                    </p>
                  )}
                </div>
              </div>
            )}

            <p
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                previa === 0 || (clientesAlvo === "por_filtro" && semCriterio)
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                  : "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
              )}
            >
              {clientesAlvo === "por_filtro" && semCriterio
                ? "Escolha ao menos um critério acima."
                : previa === null
                  ? "Calculando público…"
                  : `${previa} ${previa === 1 ? "cliente vai" : "clientes vão"} receber. Quem pediu para sair das campanhas não entra na conta.`}
            </p>
          </div>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="sticky bottom-0 -mx-5 -mb-5 mt-5 flex justify-end gap-2 border-t border-gray-100 bg-white px-5 py-3 dark:border-white/10 dark:bg-navy-800 sm:-mx-6 sm:-mb-5 sm:px-6">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando..." : "Criar campanha"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
