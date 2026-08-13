"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Send, X } from "lucide-react";
import { VitoriaAvatar } from "./VitoriaAvatar";

const STORAGE_KEY = "precobom-vitoria-ia-historico";
const MAX_HISTORICO_SALVO = 20;

type Mensagem = {
  id: string;
  pergunta: string;
  resposta: string | null;
  pendente?: boolean;
};

/**
 * Bolha flutuante da Vitória AI, visível em qualquer tela do painel (estilo
 * "chat de suporte"). Substitui a antiga aba dedicada `/consulta-ia` — a
 * ideia é a equipe conseguir perguntar sem sair da tela onde está
 * trabalhando. O histórico fica só no navegador (localStorage), não é
 * compartilhado entre a equipe nem entre dispositivos.
 */
export function VitoriaFloatingWidget({ fotoUrl }: { fotoUrl?: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [historico, setHistorico] = useState<Mensagem[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (salvo) setHistorico(JSON.parse(salvo));
    } catch {
      // localStorage indisponível ou dado corrompido — só começa vazio.
    }
  }, []);

  useEffect(() => {
    if (historico.length === 0) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historico.slice(-MAX_HISTORICO_SALVO)));
  }, [historico]);

  useEffect(() => {
    if (aberto) listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight });
  }, [historico, aberto]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const texto = pergunta.trim();
    if (texto.length < 3 || enviando) return;

    const id = crypto.randomUUID();
    setHistorico((atual) => [...atual, { id, pergunta: texto, resposta: null, pendente: true }]);
    setPergunta("");
    setEnviando(true);
    setError(null);

    try {
      const res = await fetch("/api/consulta-farmaceutica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pergunta: texto }),
      });
      const body = await res.json();

      if (!res.ok) {
        setHistorico((atual) => atual.filter((m) => m.id !== id));
        setError(body.error ?? "Não foi possível consultar a IA agora.");
        return;
      }

      setHistorico((atual) =>
        atual.map((m) => (m.id === id ? { ...m, resposta: body.resposta, pendente: false } : m))
      );
    } catch {
      setHistorico((atual) => atual.filter((m) => m.id !== id));
      setError("Não foi possível conectar à IA agora.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      {aberto && (
        <div className="fixed bottom-36 right-4 z-50 flex h-[70vh] max-h-[32rem] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-navy-900 md:bottom-24 md:right-6">
          <div className="flex items-center gap-3 bg-navy-950 px-4 py-3">
            <VitoriaAvatar size={36} className="shrink-0" fotoUrl={fotoUrl} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Vitória AI</p>
              <p className="truncate text-xs text-gray-300">Referência rápida da equipe</p>
            </div>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded-full p-1.5 text-gray-300 transition hover:bg-white/10 hover:text-white"
              aria-label="Fechar Vitória AI"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex items-start gap-2 border-b border-yellow-200 bg-yellow-50 px-3 py-2 text-[11px] leading-snug text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <p>Referência da IA — não substitui a bula oficial nem o julgamento profissional.</p>
          </div>

          <div ref={listaRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {historico.length === 0 && (
              <p className="mt-6 text-center text-sm text-gray-400 dark:text-gray-500">
                Pergunte sobre contraindicação, genérico ou substância de um produto.
              </p>
            )}
            {historico.map((item) => (
              <div key={item.id} className="space-y-2">
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent-500 px-3 py-2 text-sm text-white">
                    {item.pergunta}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <VitoriaAvatar size={22} className="mt-0.5 shrink-0" fotoUrl={fotoUrl} />
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2 text-sm text-gray-700 dark:bg-white/5 dark:text-gray-200">
                    {item.pendente ? (
                      <span className="inline-flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
                        <Loader2 size={13} className="animate-spin" /> digitando...
                      </span>
                    ) : (
                      <span className="whitespace-pre-wrap">{item.resposta}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="border-t border-gray-100 p-2.5 dark:border-white/10">
            {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex items-end gap-2">
              <textarea
                rows={1}
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Pergunte pra Vitória..."
                maxLength={500}
                className="max-h-24 flex-1 resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-accent-400 focus:outline-none dark:border-white/10 dark:bg-navy-950 dark:text-white"
              />
              <button
                type="submit"
                disabled={enviando}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-500 text-white transition hover:bg-accent-600 disabled:opacity-50"
                aria-label="Perguntar"
              >
                {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-navy-950 shadow-lg transition hover:scale-105 md:bottom-6 md:right-6"
        aria-label={aberto ? "Fechar Vitória AI" : "Abrir Vitória AI"}
      >
        {aberto ? <X size={22} className="text-white" /> : <VitoriaAvatar size={40} fotoUrl={fotoUrl} />}
      </button>
    </>
  );
}
