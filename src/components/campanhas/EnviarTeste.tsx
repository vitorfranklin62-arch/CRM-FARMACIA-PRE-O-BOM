"use client";

import { useState } from "react";
import { CheckCircle2, FlaskConical, Loader2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

type Resultado = {
  ok: boolean;
  http: number;
  erro: string | null;
  endpoint: string;
  messageid: string | null;
  enviado: Record<string, unknown>;
  resposta: unknown;
};

/**
 * "Enviar teste": manda a campanha (do jeito que ela vai sair) só pro número
 * digitado aqui e mostra a resposta real da uazapi. Não dispara nada para os
 * clientes nem conta como envio da campanha.
 */
export function EnviarTeste({
  mensagem,
  midiaPath,
  bloqueado,
}: {
  mensagem: string;
  midiaPath: string | null;
  bloqueado: boolean;
}) {
  const [numero, setNumero] = useState("");
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const semConteudo = !mensagem.trim() && !midiaPath;

  async function enviar() {
    setErro(null);
    setResultado(null);
    if (numero.replace(/\D/g, "").length < 10) {
      setErro("Informe o número de teste com DDD.");
      return;
    }
    setEnviando(true);
    const res = await fetch("/api/campanhas/teste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        envio_id: crypto.randomUUID(),
        numero,
        nome: nome.trim() || undefined,
        mensagem,
        midia_path: midiaPath,
      }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setEnviando(false);

    if (!res) {
      setErro("Sem resposta do servidor. Confira no celular se o teste chegou antes de tentar de novo.");
      return;
    }
    if (json && typeof json.endpoint === "string") setResultado(json as Resultado);
    else setErro(json.error ?? `Falha no teste (HTTP ${res.status}).`);
  }

  return (
    <div className="space-y-2 rounded-xl border border-gray-100 p-3 dark:border-white/10">
      <p className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200">
        <FlaskConical size={15} /> Enviar teste
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Vai só para o número abaixo (use o seu). Os clientes não recebem nada.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="Número com DDD"
          inputMode="tel"
          aria-label="Número de teste"
        />
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome (ex.: Maria)"
          maxLength={60}
          aria-label="Nome usado no teste"
        />
        <Button type="button" variant="secondary" onClick={enviar} disabled={enviando || bloqueado || semConteudo} className="shrink-0">
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />} Testar
        </Button>
      </div>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-300">{erro}</p>}

      {resultado && (
        <div
          className={
            resultado.ok
              ? "rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300"
          }
        >
          <p className="flex items-center gap-1.5 font-medium">
            {resultado.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {resultado.ok
              ? "A uazapi aceitou o teste. Confira no celular a imagem, o texto e o nome."
              : `A uazapi recusou: ${resultado.erro ?? `HTTP ${resultado.http}`}`}
          </p>
          <p className="mt-1">
            {resultado.endpoint} · HTTP {resultado.http}
            {resultado.messageid && <> · id da mensagem {resultado.messageid}</>}
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer">Detalhes técnicos (o que foi enviado e a resposta)</summary>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-black/5 p-2 text-[11px] dark:bg-white/5">
              {JSON.stringify({ enviado: resultado.enviado, resposta: resultado.resposta }, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
