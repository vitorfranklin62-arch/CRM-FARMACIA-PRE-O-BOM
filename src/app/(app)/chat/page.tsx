import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ChatShell } from "@/components/chat/ChatShell";
import type { ConversaCompleta } from "@/types/relations";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("conversas")
    .select("*, clientes(*)")
    .order("atualizado_em", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Chat ao vivo</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Acompanhe e intervenha nas conversas com clientes.</p>
      </div>
      <ChatShell conversas={(data as ConversaCompleta[]) ?? []} />
    </div>
  );
}
