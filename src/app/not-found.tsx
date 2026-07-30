import Link from "next/link";
import { LogoMark } from "@/components/ui/Logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F5F6FA] px-4 text-center dark:bg-[#0A0F1E]">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-900 shadow-lg shadow-navy-900/20">
        <LogoMark size={38} />
      </div>
      <div>
        <h1 className="text-3xl font-bold text-navy-900 dark:text-white">404</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Essa página não existe ou foi movida.</p>
      </div>
      <Link
        href="/dashboard"
        className="rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-600"
      >
        Voltar pro painel
      </Link>
    </div>
  );
}
