import { loja } from "@/config/loja";
import { LogoLockup } from "./LogoLockup";
import { AbertoFechadoBadge } from "./AbertoFechadoBadge";
import { WhatsAppButton } from "./WhatsAppButton";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 bg-site-azul-marinho font-site shadow-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <LogoLockup className="[&_svg]:h-9 [&_svg]:w-9 md:[&_svg]:h-11 md:[&_svg]:w-11" />
          <div className="hidden min-w-0 flex-col leading-tight text-white/90 sm:flex">
            <span className="truncate text-xs">{loja.endereco.curto}</span>
            <AbertoFechadoBadge />
          </div>
        </div>

        <WhatsAppButton secao="hero" size="sm" className="shrink-0">
          <span className="hidden sm:inline">Chamar no WhatsApp</span>
          <span className="sm:hidden">WhatsApp</span>
        </WhatsAppButton>
      </div>
    </header>
  );
}
