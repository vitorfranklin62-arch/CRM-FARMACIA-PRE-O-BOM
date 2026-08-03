import { AtSign } from "lucide-react";
import { loja } from "@/config/loja";
import { LogoLockup } from "./LogoLockup";

export function SiteFooter() {
  return (
    <footer className="bg-site-azul-marinho py-10 font-site text-white/80">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <LogoLockup className="[&_svg]:h-9 [&_svg]:w-9" />

        <div className="mt-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <p>{loja.endereco.curto}</p>
          <p>{loja.horarioResumo}</p>
          <p>CNPJ {loja.cnpj}</p>
          <p>{loja.farmaceuticoResponsavel}</p>
        </div>

        <a
          href={loja.instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram da Farmácia Preço Bom"
          className="mt-5 inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-white hover:underline"
        >
          <AtSign className="h-5 w-5" aria-hidden />
          {loja.instagram}
        </a>

        <p className="mt-6 border-t border-white/10 pt-5 text-xs text-white/60">{loja.avisoSanitario}</p>
      </div>
    </footer>
  );
}
