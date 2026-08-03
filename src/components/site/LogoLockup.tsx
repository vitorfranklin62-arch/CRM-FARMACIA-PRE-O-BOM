import { LogoIcon } from "./LogoIcon";

/**
 * Lockup completo (ícone + nome). O texto é sempre branco — só usar sobre o
 * azul-marinho da marca. Em fundo claro, usar o nome em texto azul-marinho
 * (ver `LogoText`) em vez deste componente.
 */
export function LogoLockup({
  iconSize = 40,
  className,
  compact = false,
}: {
  iconSize?: number;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoIcon size={iconSize} />
      {!compact && (
        <span className="font-display text-lg leading-none text-white">
          <span className="block text-[0.5em] font-medium tracking-[0.18em]">FARMÁCIA</span>
          <span className="-mt-0.5 block text-[1em] font-extrabold tracking-tight">PREÇO BOM</span>
        </span>
      )}
    </div>
  );
}

/** Nome da farmácia em texto, pra usar sobre fundo claro (nunca o lockup branco). */
export function LogoText({ className }: { className?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-tight text-site-azul-marinho ${className ?? ""}`}>
      Farmácia Preço Bom
    </span>
  );
}
