import { MapPin, Navigation } from "lucide-react";
import { loja } from "@/config/loja";
import { horarioDeHoje } from "@/lib/horario-loja";

export function OndeEstamos() {
  const enderecoCodificado = encodeURIComponent(loja.endereco.curto);
  const mapaSrc = `https://www.google.com/maps?q=${enderecoCodificado}&output=embed`;
  const rotaHref = `https://www.google.com/maps/dir/?api=1&destination=${enderecoCodificado}`;
  const hoje = horarioDeHoje();

  return (
    <section id="onde-estamos" className="bg-white py-14 font-site md:py-20">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <h2 className="font-display text-2xl font-extrabold text-site-azul-marinho md:text-3xl">Onde estamos</h2>

        <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <p className="flex items-start gap-2 text-site-grafite">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-site-vermelho-marca" aria-hidden />
              {loja.endereco.curto}
            </p>

            <table className="mt-5 w-full text-sm">
              <tbody>
                {loja.horarios.map((horario) => (
                  <tr
                    key={horario.dia}
                    className={horario.dia === hoje.dia ? "font-semibold text-site-azul-marinho" : "text-site-grafite/80"}
                  >
                    <td className="py-1 pr-4">{horario.dia}</td>
                    <td className="py-1 tabular-nums">
                      {horario.abertura} às {horario.fechamento}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <a
              href={rotaHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full border-2 border-site-azul-marinho px-5 py-3 text-sm font-semibold text-site-azul-marinho transition-colors hover:bg-site-azul-marinho hover:text-white"
            >
              <Navigation className="h-4 w-4" aria-hidden />
              Traçar rota
            </a>
          </div>

          <div className="overflow-hidden rounded-2xl shadow-card">
            <iframe
              src={mapaSrc}
              title="Mapa com a localização da Farmácia Preço Bom"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-72 w-full border-0 md:h-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
