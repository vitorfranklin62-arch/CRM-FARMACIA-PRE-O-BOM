import { NextResponse } from "next/server";
import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { normalizarTelefone } from "@/lib/telefone";
import { selecionarTodos } from "@/lib/supabase/fetch-all";

interface ClienteLinha {
  id: string;
  nome: string;
  telefone: string;
  ultima_interacao: string | null;
  criado_em: string;
}

/**
 * Agrupa clientes pelo telefone normalizado (só dígitos). Antes da
 * normalização ser aplicada nos webhooks, o mesmo número podia gerar várias
 * linhas de cliente diferentes (com/sem "+", espaços, traço, sufixo de
 * WhatsApp) — cada uma com suas próprias conversas e pedidos. Dentro de
 * cada grupo, a linha com interação mais recente é a "sobrevivente".
 */
function agruparDuplicados(clientes: ClienteLinha[]) {
  const grupos = new Map<string, ClienteLinha[]>();
  for (const c of clientes) {
    const chave = normalizarTelefone(c.telefone);
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(c);
    else grupos.set(chave, [c]);
  }

  const duplicados = Array.from(grupos.values()).filter((g) => g.length > 1);
  for (const g of duplicados) {
    g.sort((a, b) => {
      const dataA = new Date(a.ultima_interacao ?? a.criado_em).getTime();
      const dataB = new Date(b.ultima_interacao ?? b.criado_em).getTime();
      return dataB - dataA;
    });
  }
  return duplicados;
}

/** GET: só mostra o que seria mesclado, não mexe em nada. */
export async function GET() {
  try {
    await requireDona();
    const supabase = await createClient();

    const { data, error } = await selecionarTodos<ClienteLinha>((from, to) =>
      supabase.from("clientes").select("id, nome, telefone, ultima_interacao, criado_em").range(from, to)
    );
    if (error) {
      return NextResponse.json({ error: `Não foi possível ler os clientes: ${error.message}` }, { status: 500 });
    }

    const duplicados = agruparDuplicados(data);
    const clientesParaRemover = duplicados.reduce((acc, g) => acc + g.length - 1, 0);

    return NextResponse.json({
      totalClientes: data.length,
      numerosComDuplicatas: duplicados.length,
      clientesParaRemover,
      amostra: duplicados.slice(0, 15).map((g) => ({
        telefone: normalizarTelefone(g[0].telefone),
        mantido: g[0].nome,
        removidos: g.slice(1).map((c) => c.nome),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Erro inesperado: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

/**
 * POST: executa a mesclagem de verdade. Move conversas e pedidos das
 * linhas duplicadas pro cliente sobrevivente (telefone já fica normalizado
 * nele) e então apaga as linhas de cliente que sobraram vazias.
 */
export async function POST() {
  try {
    const usuario = await requireDona();
    const supabase = await createClient();

    const { data, error } = await selecionarTodos<ClienteLinha>((from, to) =>
      supabase.from("clientes").select("id, nome, telefone, ultima_interacao, criado_em").range(from, to)
    );
    if (error) {
      return NextResponse.json({ error: `Não foi possível ler os clientes: ${error.message}` }, { status: 500 });
    }

    const duplicados = agruparDuplicados(data);

    let mesclados = 0;
    let bloqueados = 0;
    let primeiroErro: string | null = null;

    for (const grupo of duplicados) {
      const [sobrevivente, ...outras] = grupo;

      const { error: erroTelefone } = await supabase
        .from("clientes")
        .update({ telefone: normalizarTelefone(sobrevivente.telefone) })
        .eq("id", sobrevivente.id);
      if (erroTelefone) {
        bloqueados += outras.length;
        primeiroErro ??= erroTelefone.message;
        continue;
      }

      for (const duplicata of outras) {
        const { error: erroConversas } = await supabase
          .from("conversas")
          .update({ cliente_id: sobrevivente.id })
          .eq("cliente_id", duplicata.id);
        if (erroConversas) {
          bloqueados += 1;
          primeiroErro ??= erroConversas.message;
          continue;
        }

        const { error: erroPedidos } = await supabase
          .from("pedidos")
          .update({ cliente_id: sobrevivente.id })
          .eq("cliente_id", duplicata.id);
        if (erroPedidos) {
          bloqueados += 1;
          primeiroErro ??= erroPedidos.message;
          continue;
        }

        const { error: erroExclusao } = await supabase.from("clientes").delete().eq("id", duplicata.id);
        if (erroExclusao) {
          bloqueados += 1;
          primeiroErro ??= erroExclusao.message;
        } else {
          mesclados += 1;
        }
      }
    }

    await logAudit(
      supabase,
      "clientes_duplicados_mesclados",
      "clientes",
      null,
      { numerosComDuplicatas: duplicados.length, mesclados, bloqueados },
      usuario.id
    );

    return NextResponse.json({
      numerosComDuplicatas: duplicados.length,
      mesclados,
      bloqueados,
      primeiroErro,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Erro inesperado: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
