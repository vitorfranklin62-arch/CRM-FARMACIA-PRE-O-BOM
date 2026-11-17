/**
 * Banco FALSO em memória, só para os testes do disparo de campanhas. Imita o
 * pedaço do cliente do Supabase que src/lib/campanhas/disparo.ts usa
 * (from/select/insert/update/upsert/filtros/rpc/storage) e as travas do banco
 * que importam pro disparo (um lote ativo por vez; campanha + telefone único).
 */
import { randomUUID } from "node:crypto";

type Linha = Record<string, unknown>;
type Resposta = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };

export const banco: { tabelas: Record<string, Linha[]>; arquivos: Set<string>; clientes: Linha[] } = {
  tabelas: {},
  arquivos: new Set(),
  clientes: [],
};

export function zerarBanco() {
  banco.tabelas = { campanhas: [], campanha_lotes: [], campanha_envios: [], audit_log: [] };
  banco.arquivos = new Set();
  banco.clientes = [];
}
zerarBanco();

const PADROES: Record<string, () => Linha> = {
  campanha_lotes: () => ({
    id: randomUUID(),
    folder_id: null,
    status: "criando",
    total: 0,
    agendado_para: null,
    pausado_pela_janela: false,
    retomado_em: null,
    erro: null,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    concluido_em: null,
  }),
  campanha_envios: () => ({
    id: randomUUID(),
    cliente_id: null,
    erro: null,
    enviado_em: new Date().toISOString(),
    lote_id: null,
    message_id: null,
    entregue_em: null,
    lido_em: null,
  }),
};

const LOTE_ATIVO = ["criando", "agendado", "enviando"];
const LOTE_ABERTO = [...LOTE_ATIVO, "pausado"];

/** As travas únicas do banco real (índices de 20261023_campanhas_disparo_uazapi.sql e 20260828). */
function violaUnico(tabela: string, nova: Linha, ignorar?: Linha): string | null {
  const linhas = (banco.tabelas[tabela] ?? []).filter((l) => l !== ignorar);
  if (tabela === "campanha_lotes") {
    if (LOTE_ATIVO.includes(nova.status as string) && linhas.some((l) => LOTE_ATIVO.includes(l.status as string))) {
      return "idx_campanha_lotes_um_ativo";
    }
    if (
      LOTE_ABERTO.includes(nova.status as string) &&
      linhas.some((l) => l.campanha_id === nova.campanha_id && LOTE_ABERTO.includes(l.status as string))
    ) {
      return "idx_campanha_lotes_um_aberto_por_campanha";
    }
  }
  if (tabela === "campanha_envios" && linhas.some((l) => l.campanha_id === nova.campanha_id && l.telefone === nova.telefone)) {
    return "idx_campanha_envios_unico";
  }
  return null;
}

class Consulta implements PromiseLike<Resposta> {
  private filtros: ((l: Linha) => boolean)[] = [];
  private operacao: "select" | "insert" | "update" | "upsert" = "select";
  private valores: Linha[] = [];
  private mudancas: Linha = {};
  private conflito: string[] = [];
  private ordem: { coluna: string; asc: boolean; nullsFirst: boolean } | null = null;
  private limite: number | null = null;
  private devolver = false;
  private contar = false;
  private umSo: "single" | "maybe" | null = null;

  private tabela: string;

  constructor(tabela: string) {
    this.tabela = tabela;
    banco.tabelas[tabela] ??= [];
  }

  select(_colunas?: string, opcoes?: { count?: string; head?: boolean }) {
    if (this.operacao !== "select") this.devolver = true;
    if (opcoes?.count) this.contar = true;
    return this;
  }
  insert(valores: Linha | Linha[]) {
    this.operacao = "insert";
    this.valores = Array.isArray(valores) ? valores : [valores];
    return this;
  }
  update(mudancas: Linha) {
    this.operacao = "update";
    this.mudancas = mudancas;
    return this;
  }
  upsert(valores: Linha | Linha[], opcoes?: { onConflict?: string }) {
    this.operacao = "upsert";
    this.valores = Array.isArray(valores) ? valores : [valores];
    this.conflito = (opcoes?.onConflict ?? "id").split(",");
    return this;
  }
  eq(c: string, v: unknown) {
    this.filtros.push((l) => l[c] === v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filtros.push((l) => vs.includes(l[c]));
    return this;
  }
  is(c: string, v: null) {
    this.filtros.push((l) => (l[c] ?? null) === v);
    return this;
  }
  not(c: string, op: string, v: null) {
    if (op !== "is") throw new Error(`not(${op}) não simulado`);
    this.filtros.push((l) => (l[c] ?? null) !== v);
    return this;
  }
  gte(c: string, v: string) {
    this.filtros.push((l) => typeof l[c] === "string" && (l[c] as string) >= v);
    return this;
  }
  /** Só o formato usado no disparo: "col.is.null,col.lte.<iso>". */
  or(expr: string) {
    const partes = expr.split(",").map((p) => p.split("."));
    this.filtros.push((l) =>
      partes.some(([c, op, ...resto]) => {
        const v = resto.join(".");
        if (op === "is" && v === "null") return l[c] == null;
        if (op === "lte") return typeof l[c] === "string" && new Date(l[c] as string) <= new Date(v);
        throw new Error(`or(${op}) não simulado`);
      })
    );
    return this;
  }
  order(coluna: string, opcoes?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.ordem = { coluna, asc: opcoes?.ascending ?? true, nullsFirst: opcoes?.nullsFirst ?? false };
    return this;
  }
  limit(n: number) {
    this.limite = n;
    return this;
  }
  single() {
    this.umSo = "single";
    return this;
  }
  maybeSingle() {
    this.umSo = "maybe";
    return this;
  }

  private filtrar() {
    return banco.tabelas[this.tabela].filter((l) => this.filtros.every((f) => f(l)));
  }

  private executar(): Resposta {
    const tabela = banco.tabelas[this.tabela];
    let resultado: Linha[] = [];

    if (this.operacao === "insert") {
      for (const v of this.valores) {
        const nova = { ...(PADROES[this.tabela]?.() ?? { id: randomUUID() }), ...v };
        const trava = violaUnico(this.tabela, nova);
        if (trava) return { data: null, error: { message: `duplicate key value violates unique constraint "${trava}"`, code: "23505" } };
        tabela.push(nova);
        resultado.push(nova);
      }
    } else if (this.operacao === "upsert") {
      for (const v of this.valores) {
        const existente = tabela.find((l) => this.conflito.every((c) => l[c] === v[c]));
        if (existente) Object.assign(existente, v);
        else tabela.push({ ...(PADROES[this.tabela]?.() ?? { id: randomUUID() }), ...v });
      }
    } else if (this.operacao === "update") {
      resultado = this.filtrar();
      for (const l of resultado) Object.assign(l, this.mudancas);
    } else {
      resultado = this.filtrar();
      if (this.ordem) {
        const { coluna, asc, nullsFirst } = this.ordem;
        resultado = [...resultado].sort((a, b) => {
          const x = a[coluna] as string | null;
          const y = b[coluna] as string | null;
          if (x == null || y == null) return x == y ? 0 : (x == null) === nullsFirst ? -1 : 1;
          return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
        });
      }
      if (this.limite !== null) resultado = resultado.slice(0, this.limite);
    }

    const copia = resultado.map((l) => ({ ...l }));
    if (this.contar) return { data: null, error: null, count: copia.length };
    if (this.umSo) {
      if (copia.length === 0) return this.umSo === "single" ? { data: null, error: { message: "nenhuma linha" } } : { data: null, error: null };
      return { data: copia[0], error: null };
    }
    return { data: this.operacao === "select" || this.devolver ? copia : null, error: null };
  }

  then<A = Resposta, B = never>(ok?: ((v: Resposta) => A | PromiseLike<A>) | null, falha?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve()
      .then(() => this.executar())
      .then(ok, falha);
  }
}

const clienteFalso = {
  auth: { getUser: async () => ({ data: { user: null } }) },
  from: (tabela: string) => new Consulta(tabela),
  rpc: async (nome: string) => {
    if (nome !== "filtrar_clientes_campanha") throw new Error(`rpc ${nome} não simulada`);
    return { data: banco.clientes.map((c) => ({ ...c })), error: null };
  },
  storage: {
    from: (_bucket: string) => ({
      upload: async (caminho: string, _bytes: ArrayBuffer, opcoes?: { upsert?: boolean }) => {
        if (banco.arquivos.has(caminho) && !opcoes?.upsert) return { data: null, error: { message: "The resource already exists" } };
        banco.arquivos.add(caminho);
        return { data: { path: caminho }, error: null };
      },
      remove: async (caminhos: string[]) => {
        for (const c of caminhos) banco.arquivos.delete(c);
        return { data: [], error: null };
      },
      createSignedUrl: async (caminho: string, segundos: number) =>
        banco.arquivos.has(caminho)
          ? { data: { signedUrl: `https://projeto.supabase.co/storage/v1/object/sign/campanha-midia/${caminho}?token=assinado&validade=${segundos}` }, error: null }
          : { data: null, error: { message: "Object not found" } },
    }),
  },
};

export function createServiceClient() {
  return clienteFalso;
}

export async function createClient() {
  return clienteFalso;
}
