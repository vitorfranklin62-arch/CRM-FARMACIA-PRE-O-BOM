import { NextResponse } from "next/server";
import { respostaErroInesperado } from "@/lib/api";
import { requireDona } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { selecionarTodos } from "@/lib/supabase/fetch-all";
import { agruparDuplicados } from "@/lib/agrupar-duplicados";
import type { ConversaStatus } from "@/types/database";

interface ConversaLinha {
  id: string;
  cliente_id: string;
  pedido_id: string | null;
  status: ConversaStatus;
  atualizado_em: string;
}

/**
 * Agrupa conversas por cliente. Antes de reaproveitar sempre a conversa
 * mais recente do cliente no webhook, uma conversa "fechada" fazia a
 * próxima mensagem criar outra do zero — sobrando várias conversas pro
 * mesmo número. Dentro de cada grupo, a mais recentemente atualizada é a
 * "sobrevivente"; as mensagens das outras são movidas pra ela antes de
 * remover as duplicatas, pra não perder histórico.
 */
function agruparConversas(conversas: ConversaLinha[]) {
  return agruparDuplicados(
    conversas,
    (c) => c.cliente_id,
    (c) => c.atualizado_em
  );
}

/** GET: só mostra o que seria mesclado, não mexe em nada. */
export async function GET() {
  try {
    await requireDona();
    const supabase = await createClient();

    const { data, error } = await selecionarTodos<ConversaLinha>((from, to) =>
      supabase.from("conversas").select("id, cliente_id, pedido_id, status, atualizado_em").range(from, to)
    );
    if (error) {
      return NextResponse.json({ error: `Não foi possível ler as conversas: ${error.message}` }, { status: 500 });
    }

    const duplicadas = agruparConversas(data);
    const conversasParaRemover = duplicadas.reduce((acc, g) => acc + g.length - 1, 0);

    return NextResponse.json({
      totalConversas: data.length,
      clientesComDuplicatas: duplicadas.length,
      conversasParaRemover,
    });
  } catch (err) {
    return respostaErroInesperado(err);
  }
}

/**
 * POST: executa a mesclagem de verdade. Move todas as mensagens das
 * conversas duplicadas de um cliente pra conversa sobrevivente (a mais
 * recentemente atualizada), preservando pedido_id e o status
 * "aguardando_humano" caso alguma das duplicatas tivesse ficado assim, e
 * então apaga as conversas que ficaram vazias.
 */
export async function POST() {
  try {
    const usuario = await requireDona();
    const supabase = await createClient();

    const { data, error } = await selecionarTodos<ConversaLinha>((from, to) =>
      supabase.from("conversas").select("id, cliente_id, pedido_id, status, atualizado_em").range(from, to)
    );
    if (error) {
      return NextResponse.json({ error: `Não foi possível ler as conversas: ${error.message}` }, { status: 500 });
    }

    const duplicadas = agruparConversas(data);

    let mescladas = 0;
    let bloqueadas = 0;
    let primeiroErro: string | null = null;

    for (const grupo of duplicadas) {
      const [sobrevivente, ...outras] = grupo;

      const pedidoId = sobrevivente.pedido_id ?? outras.find((c) => c.pedido_id)?.pedido_id ?? null;
      const statusFinal = grupo.some((c) => c.status === "aguardando_humano")
        ? "aguardando_humano"
        : sobrevivente.status;

      const { error: erroAtualizar } = await supabase
        .from("conversas")
        .update({ pedido_id: pedidoId, status: statusFinal })
        .eq("id", sobrevivente.id);
      if (erroAtualizar) {
        bloqueadas += outras.length;
        primeiroErro ??= erroAtualizar.message;
        continue;
      }

      for (const duplicata of outras) {
        const { error: erroMover } = await supabase
          .from("mensagens")
          .update({ conversa_id: sobrevivente.id })
          .eq("conversa_id", duplicata.id);
        if (erroMover) {
          bloqueadas += 1;
          primeiroErro ??= erroMover.message;
          continue;
        }

        const { error: erroExclusao } = await supabase.from("conversas").delete().eq("id", duplicata.id);
        if (erroExclusao) {
          bloqueadas += 1;
          primeiroErro ??= erroExclusao.message;
        } else {
          mescladas += 1;
        }
      }
    }

    await logAudit(
      supabase,
      "conversas_duplicadas_mescladas",
      "conversas",
      null,
      { clientesComDuplicatas: duplicadas.length, mescladas, bloqueadas },
      usuario.id
    );

    return NextResponse.json({
      clientesComDuplicatas: duplicadas.length,
      mescladas,
      bloqueadas,
      primeiroErro,
    });
  } catch (err) {
    return respostaErroInesperado(err);
  }
}
