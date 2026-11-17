"use client";

import { useMemo, useState } from "react";
import { CheckCheck } from "lucide-react";
import { montarTexto } from "@/lib/campanhas/regras";
import { formatarWhatsapp, type NoFormatado } from "@/lib/campanhas/formatacao-whatsapp";

function Formatado({ nos }: { nos: NoFormatado[] }) {
  return (
    <>
      {nos.map((no, i) => {
        if (no.tipo === "texto") return <span key={i}>{no.texto}</span>;
        if (no.tipo === "mono") return <code key={i} className="font-mono text-[0.85em]">{no.texto}</code>;
        const filhos = <Formatado nos={no.filhos} />;
        if (no.tipo === "negrito") return <strong key={i} className="font-semibold">{filhos}</strong>;
        if (no.tipo === "italico") return <em key={i}>{filhos}</em>;
        return <s key={i}>{filhos}</s>;
      })}
    </>
  );
}

/**
 * Como a campanha vai aparecer no celular do cliente: foto e legenda na mesma
 * bolha, com quebras de linha, emojis, formatação do WhatsApp e o rodapé de
 * descadastro. Usa o MESMO `montarTexto` do disparo, com um nome de exemplo.
 */
export function PreviaWhatsapp({ mensagem, imagemUrl }: { mensagem: string; imagemUrl: string | null }) {
  const [nome, setNome] = useState("Maria Souza");
  const [semNome, setSemNome] = useState(false);

  const texto = useMemo(
    () => montarTexto(mensagem, semNome ? null : nome, { saudacaoFixa: "Olá" }),
    [mensagem, nome, semNome]
  );
  const nos = useMemo(() => formatarWhatsapp(texto), [texto]);
  const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  const vazio = !mensagem.trim() && !imagemUrl;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>Prévia para</span>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          disabled={semNome}
          maxLength={40}
          aria-label="Nome de exemplo na prévia"
          className="w-32 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
        />
        <label className="flex cursor-pointer items-center gap-1">
          <input type="checkbox" checked={semNome} onChange={(e) => setSemNome(e.target.checked)} />
          cliente sem nome no cadastro
        </label>
      </div>

      {/* Fundo e bolha nas cores do WhatsApp (claro e escuro). */}
      <div className="rounded-xl bg-[#efeae2] p-3 dark:bg-[#0b141a]">
        {vazio ? (
          <p className="py-6 text-center text-xs text-gray-500">Escreva a mensagem ou adicione uma imagem para ver a prévia.</p>
        ) : (
          <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-[#d9fdd3] p-1 shadow-sm dark:bg-[#005c4b]">
            {imagemUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagemUrl} alt="Imagem da campanha" className="max-h-72 w-full rounded-md object-cover" />
            )}
            <div className="px-1.5 pb-0.5 pt-1">
              <p className="whitespace-pre-wrap break-words text-[13.5px] leading-snug text-[#111b21] dark:text-[#e9edef]">
                <Formatado nos={nos} />
              </p>
              <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[#667781] dark:text-[#ffffff99]">
                {hora} <CheckCheck size={13} className="text-[#53bdeb]" />
              </p>
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500">
        {"{{saudacao}}"} sorteia entre “Oi” e “Olá” em cada envio. O rodapé de descadastro entra sozinho.
      </p>
    </div>
  );
}
