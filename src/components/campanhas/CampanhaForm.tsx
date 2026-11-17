"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label, Input, Textarea, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { campanhaCreateSchema } from "@/lib/validation";
import { variaveisDesconhecidas } from "@/lib/campanhas/regras";
import { cn } from "@/lib/utils";
import { SeletorImagem, type MidiaCampanha } from "./SeletorImagem";
import { PreviaWhatsapp } from "./PreviaWhatsapp";
import { EnviarTeste } from "./EnviarTeste";
import type { ClientesAlvo, FiltroCampanha, OrigemChat, Tag } from "@/types/database";

type ClienteOpcao = { id: string; nome: string; telefone: string };
type Atividade = "" | "ativos" | "inativos";

export function CampanhaForm({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  // O id nasce aqui (e não no banco) pra imagem já subir na pasta da campanha.
  const [campanhaId, setCampanhaId] = useState(() => crypto.randomUUID());
  const [midia, setMidia] = useState<MidiaCampanha | null>(null);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
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
    setCampanhaId(crypto.randomUUID());
    setMidia(null);
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

  // Prévia "quantos vão receber". Usa a MESMA função do banco que é usada
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

  // Fechar sem salvar: a imagem que subiu não pertence a campanha nenhuma — apaga.
  function fechar() {
    if (midia && !saving) {
      void fetch("/api/campanhas/midia", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ midia_path: midia.midia_path }),
      }).catch(() => {});
      setMidia(null);
    }
    onClose();
  }

  const desconhecidas = useMemo(() => variaveisDesconhecidas(mensagem), [mensagem]);
  const modalidade = midia ? (mensagem.trim() ? "Imagem com legenda" : "Somente imagem") : "Somente texto";

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

    if (enviandoImagem) {
      setError("Espere a imagem terminar de enviar.");
      return;
    }
    if (!mensagem.trim() && !midia) {
      setError("Escreva a mensagem ou adicione uma imagem.");
      return;
    }
    if (desconhecidas.length > 0) {
      setError(`A mensagem usa ${desconhecidas.map((v) => `{{${v}}}`).join(", ")}, que o disparo não sabe preencher. Use só {{nome}} e {{saudacao}}.`);
      return;
    }

    const parsed = campanhaCreateSchema.safeParse({
      id: campanhaId,
      titulo,
      mensagem,
      clientes_alvo: clientesAlvo,
      filtro_json: clientesAlvo === "por_filtro" ? filtro : null,
      agendada_para: agendadaPara ? new Date(agendadaPara).toISOString() : null,
      midia: midia ? { midia_path: midia.midia_path, midia_mime: midia.midia_mime, midia_tamanho: midia.midia_tamanho } : null,
    });

    if (!parsed.success) {
      setError("Preencha o título e a mensagem (ou a imagem) corretamente.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("campanhas")
      .insert({
        id: parsed.data.id,
        titulo: parsed.data.titulo,
        mensagem: parsed.data.mensagem,
        clientes_alvo: parsed.data.clientes_alvo,
        filtro_json: parsed.data.filtro_json ?? null,
        agendada_para: parsed.data.agendada_para,
        status: parsed.data.agendada_para ? "agendada" : "rascunho",
        criado_por: userId,
        // Só manda as colunas de imagem quando tem imagem: campanha de texto
        // continua funcionando mesmo antes da migração 20261117 ser rodada.
        ...(parsed.data.midia ?? {}),
      })
      .select("id")
      .single();
    setSaving(false);

    if (dbError) {
      const semMigracao = /midia_|column|schema cache/i.test(dbError.message);
      setError(
        semMigracao && parsed.data.midia
          ? "O banco ainda não aceita imagem em campanhas. Rode a migração supabase/migrations/20261117_campanhas_imagem.sql no Supabase."
          : "Não foi possível criar a campanha."
      );
      return;
    }

    await logAudit(supabase, "campanha_criada", "campanhas", data?.id, {
      titulo: parsed.data.titulo,
      com_imagem: !!parsed.data.midia,
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
    <Modal
      open={open}
      onClose={fechar}
      title="Nova campanha"
      size="xl"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              previa === 0 || (clientesAlvo === "por_filtro" && semCriterio)
                ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                : "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
            )}
          >
            {clientesAlvo === "por_filtro" && semCriterio
              ? "Escolha ao menos um critério de público."
              : previa === null
                ? "Calculando público…"
                : `${previa} ${previa === 1 ? "cliente vai" : "clientes vão"} receber`}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" form="campanha-form" disabled={saving || enviandoImagem}>
              {saving ? "Salvando..." : "Criar campanha"}
            </Button>
          </div>
        </div>
      }
    >
      <form id="campanha-form" onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label htmlFor="titulo">Título</Label>
              <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={200} />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label>Imagem</Label>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  {modalidade}
                </span>
              </div>
              <SeletorImagem
                campanhaId={campanhaId}
                midia={midia}
                onChange={setMidia}
                onEnviandoChange={setEnviandoImagem}
              />
            </div>

            <div>
              <Label htmlFor="mensagem">{midia ? "Legenda da imagem (opcional)" : "Mensagem"}</Label>
              <Textarea
                id="mensagem"
                rows={9}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                required={!midia}
                maxLength={2000}
                placeholder={"Olá, {{nome}}! 💚\n\n*Negrito*, _itálico_ e ~tachado~ funcionam como no WhatsApp."}
              />
              <p className="mt-1 flex justify-between text-[11px] text-gray-400 dark:text-gray-500">
                <span>Variáveis: {"{{nome}}"} e {"{{saudacao}}"}</span>
                <span>{mensagem.length}/2000</span>
              </p>
              {desconhecidas.length > 0 && (
                <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  {desconhecidas.map((v) => `{{${v}}}`).join(", ")} não existe — o cliente receberia isso escrito assim. Use só{" "}
                  {"{{nome}}"} e {"{{saudacao}}"}.
                </p>
              )}
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
                  <div className="relative">
                    <Search
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <Input
                      id="busca"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Buscar por nome ou telefone"
                      className="pl-9"
                    />
                  </div>
                  <div className="mt-2 max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100 dark:divide-white/5 dark:border-white/10">
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
          </div>
        </div>

        <div className="mt-6 grid gap-6 border-t border-gray-100 pt-5 lg:grid-cols-2 dark:border-white/10">
          <div>
            <Label>Como vai chegar no WhatsApp</Label>
            <PreviaWhatsapp mensagem={mensagem} imagemUrl={midia?.previaUrl ?? null} />
          </div>
          <div>
            <EnviarTeste mensagem={mensagem} midiaPath={midia?.midia_path ?? null} bloqueado={enviandoImagem} />
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}
