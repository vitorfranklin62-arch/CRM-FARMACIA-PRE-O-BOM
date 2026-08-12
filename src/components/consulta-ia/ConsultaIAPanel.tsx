"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Pill, Send } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/utils";
import { AtlasAvatar } from "./AtlasAvatar";
import type { ConsultaFarmaceuticaComUsuario } from "@/types/relations";

type HistoricoItem = {
  id: string;
  pergunta: string;
  resposta: string | null;
  criado_em: string;
  usuarioNome: string;
};

function normalizar(item: ConsultaFarmaceuticaComUsuario): HistoricoItem {
  return {
    id: item.id,
    pergunta: item.pergunta,
    resposta: item.resposta,
    criado_em: item.criado_em,
    usuarioNome: item.usuarios?.nome ?? "Equipe",
  };
}

export function ConsultaIAPanel({
  usuarioNome,
  historicoInicial,
}: {
  usuarioNome: string;
  historicoInicial: ConsultaFarmaceuticaComUsuario[];
}) {
  const [pergunta, setPergunta] = useState("");
  const [historico, setHistorico] = useState<HistoricoItem[]>(() => historicoInicial.map(normalizar));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const texto = pergunta.trim();
    if (texto.length < 3) {
      setError("Escreva a pergunta completa.");
      return;
    }

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
        setError(body.error ?? "Não foi possível consultar a IA agora.");
        return;
      }

      setHistorico((atual) => [
        {
          id: body.id ?? crypto.randomUUID(),
          pergunta: texto,
          resposta: body.resposta,
          criado_em: body.criado_em,
          usuarioNome,
        },
        ...atual,
      ]);
      setPergunta("");
    } catch {
      setError("Não foi possível conectar à IA agora.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-500/20 dark:bg-yellow-500/10 dark:text-yellow-300">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <p>
          Ferramenta interna de referência rápida — as respostas vêm do conhecimento geral da IA,{" "}
          <strong>não</strong> de uma bula oficial ou base de dados da Anvisa. Confirme sempre na bula do
          fabricante e use o julgamento profissional antes de orientar ou vender pra um cliente.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            rows={3}
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            placeholder='Ex.: "Qual o genérico do Buscopan Composto?" ou "Losartana tem contraindicação na gravidez?"'
            maxLength={500}
          />
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={enviando}>
              {enviando ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Consultando...
                </>
              ) : (
                <>
                  <Send size={15} /> Perguntar
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        {historico.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400 dark:border-white/10 dark:text-gray-500">
            Nenhuma consulta ainda. Pergunte algo acima.
          </p>
        )}
        {historico.map((item) => (
          <Card key={item.id}>
            <div className="mb-2 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
              <span className="font-medium text-gray-600 dark:text-gray-300">{item.usuarioNome}</span>
              <span>·</span>
              <span>{formatDateTime(item.criado_em)}</span>
            </div>
            <p className="mb-3 flex items-start gap-2 text-sm font-medium text-gray-900 dark:text-white">
              <Pill size={16} className="mt-0.5 shrink-0 text-brand-500" />
              {item.pergunta}
            </p>
            <div className="flex items-start gap-2.5 rounded-xl bg-gray-50 p-3 dark:bg-white/5">
              <AtlasAvatar size={28} className="shrink-0" />
              <div>
                <p className="mb-1 text-xs font-semibold text-brand-600 dark:text-brand-400">Vitória · ATLAS AI</p>
                <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-300">{item.resposta}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
