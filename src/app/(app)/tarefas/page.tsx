import { ListChecks } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CentralTarefas, type TarefaDaLista } from "@/components/tarefas/CentralTarefas";

export const dynamic = "force-dynamic";

export default async function TarefasPage() {
  const usuario = await requireUser();
  const supabase = await createClient();
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Abertas (todas) + fechadas da última semana, em consultas separadas pra
  // as fechadas nunca empurrarem as abertas pra fora do limite.
  const [abertasRes, fechadasRes, equipeRes] = await Promise.all([
    supabase
      .from("tarefas")
      .select("*, clientes(nome, telefone)")
      .not("status", "in", "(CONCLUIDA,CANCELADA)")
      .order("criado_em", { ascending: false })
      .limit(500),
    supabase
      .from("tarefas")
      .select("*, clientes(nome, telefone)")
      .in("status", ["CONCLUIDA", "CANCELADA"])
      .gte("atualizado_em", seteDiasAtras)
      .order("atualizado_em", { ascending: false })
      .limit(200),
    // Lista de responsáveis: só id e nome de quem está ativo. A RLS de
    // `usuarios` só deixa a funcionária ver a si mesma, por isso o servidor busca.
    createServiceClient().from("usuarios").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  const semTabela = abertasRes.error && /tarefas/.test(abertasRes.error.message);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-800 via-brand-600 to-accent-500 px-5 py-6 text-white shadow-card-md">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
        <div className="relative flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <ListChecks size={22} />
          </span>
          <div>
            <h1 className="text-xl font-bold">Central de Tarefas e Automações</h1>
            <p className="text-sm text-white/80">
              Quando a IA ou uma automação encontra algo que não pode resolver sozinha com segurança — pedido parado,
              produto em falta, reclamação, erro de integração — vira uma tarefa aqui, em vez de ficar esquecido.
            </p>
          </div>
        </div>
      </div>

      {semTabela ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20">
          A Central de Tarefas ainda não está ativa no banco. Rode a migração{" "}
          <code className="font-mono">supabase/migrations/20261105_central_tarefas.sql</code> no SQL editor do Supabase.
        </p>
      ) : (
        <CentralTarefas
          tarefasIniciais={[...(abertasRes.data ?? []), ...(fechadasRes.data ?? [])] as TarefaDaLista[]}
          equipe={equipeRes.data ?? []}
          usuarioId={usuario.id}
        />
      )}
    </div>
  );
}
