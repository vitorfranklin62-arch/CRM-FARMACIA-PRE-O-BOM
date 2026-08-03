import { estaAberta } from "@/lib/horario-loja";

export function AbertoFechadoBadge() {
  const aberta = estaAberta();

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"
      role="status"
    >
      <span
        className={`h-2 w-2 rounded-full ${aberta ? "bg-emerald-400" : "bg-site-vermelho-marca"}`}
        aria-hidden
      />
      {aberta ? "Aberto agora" : "Fechado agora"}
    </span>
  );
}
