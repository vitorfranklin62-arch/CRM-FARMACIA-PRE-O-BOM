import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";
import { VitoriaFloatingWidget } from "@/components/consulta-ia/VitoriaFloatingWidget";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ChatRealtimeProvider } from "@/components/chat/ChatRealtimeProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await requireUser();
  const supabase = await createClient();

  const { data: configFoto } = await supabase
    .from("configuracoes")
    .select("valor")
    .eq("chave", "vitoria_ia_foto_url")
    .maybeSingle();

  // QueryProvider + ChatRealtimeProvider envolvem o painel todo: o contador de
  // conversas não lidas (menu e título da aba) fica ao vivo em qualquer tela.
  return (
    <QueryProvider>
      <ChatRealtimeProvider>
        <div className="flex min-h-screen">
          <Sidebar role={usuario.role} />
          <div className="flex min-h-screen flex-1 flex-col">
            <Header usuario={usuario} />
            <main className="flex-1 px-4 pb-20 pt-5 md:px-8 md:pb-8">{children}</main>
          </div>
          <MobileNav role={usuario.role} />
          <VitoriaFloatingWidget fotoUrl={configFoto?.valor} />
        </div>
      </ChatRealtimeProvider>
    </QueryProvider>
  );
}
