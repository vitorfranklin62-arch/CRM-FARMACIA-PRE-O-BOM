import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await requireUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar role={usuario.role} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Header usuario={usuario} />
        <main className="flex-1 px-4 pb-20 pt-5 md:px-8 md:pb-8">{children}</main>
      </div>
      <MobileNav role={usuario.role} />
    </div>
  );
}
