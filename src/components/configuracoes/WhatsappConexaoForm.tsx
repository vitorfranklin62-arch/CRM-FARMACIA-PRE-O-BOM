"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QrCode, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type RespostaApi = { dados?: unknown; error?: string; detalhe?: unknown };

/**
 * A UAIZAP pode devolver o QR code em campos com nomes diferentes
 * dependendo da versão/painel — em vez de travar numa suposição só, tenta
 * os formatos mais comuns. Se nenhum bater, a tela mostra a resposta bruta
 * (ver `respostaBruta` no componente) pra dar pra ajustar rapidinho.
 */
function extrairQrCode(dados: unknown): string | null {
  if (!dados || typeof dados !== "object") return null;
  const obj = dados as Record<string, unknown>;
  const candidatos = [
    obj.qrcode,
    obj.qr,
    obj.base64,
    (obj.instance as Record<string, unknown> | undefined)?.qrcode,
    (obj.response as Record<string, unknown> | undefined)?.qrcode,
  ];
  const valor = candidatos.find((v) => typeof v === "string" && v.length > 20) as string | undefined;
  if (!valor) return null;
  return valor.startsWith("data:image") ? valor : `data:image/png;base64,${valor}`;
}

/** Mesma lógica defensiva do QR code, pro status de conexão. */
function extrairConectado(dados: unknown): boolean | null {
  if (!dados || typeof dados !== "object") return null;
  const obj = dados as Record<string, unknown>;
  const instance = obj.instance as Record<string, unknown> | undefined;
  const status = obj.status ?? instance?.status;
  if (typeof status === "string") return ["connected", "open", "online"].includes(status.toLowerCase());
  if (typeof obj.connected === "boolean") return obj.connected;
  if (typeof obj.loggedIn === "boolean") return obj.loggedIn;
  return null;
}

export function WhatsappConexaoForm() {
  const [carregandoStatus, setCarregandoStatus] = useState(true);
  const [gerandoQr, setGerandoQr] = useState(false);
  const [statusDados, setStatusDados] = useState<unknown>(null);
  const [qrDados, setQrDados] = useState<unknown>(null);
  const [erro, setErro] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const conectado = extrairConectado(statusDados);
  const qrCode = extrairQrCode(qrDados);

  const buscarStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/configuracoes/uazapi/status");
      const json: RespostaApi = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível consultar o status.");
        return;
      }
      setErro(null);
      setStatusDados(json.dados);
      // Conectou: para de mostrar o QR e o polling.
      if (extrairConectado(json.dados)) {
        setQrDados(null);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setCarregandoStatus(false);
    }
  }, []);

  useEffect(() => {
    buscarStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [buscarStatus]);

  async function gerarQrCode() {
    setGerandoQr(true);
    setErro(null);
    try {
      const res = await fetch("/api/configuracoes/uazapi/conectar", { method: "POST" });
      const json: RespostaApi = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível gerar o QR code.");
        setGerandoQr(false);
        return;
      }
      setQrDados(json.dados);
      // Fica checando o status a cada 4s enquanto espera o celular escanear.
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(buscarStatus, 4000);
    } catch {
      setErro("Não foi possível falar com o servidor.");
    } finally {
      setGerandoQr(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Conexão do WhatsApp"
        description="Conecte o número da farmácia pra IA e o Chat ao vivo funcionarem."
        action={
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <QrCode size={18} />
          </div>
        }
      />

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          {carregandoStatus ? (
            <span className="text-gray-400">Consultando status...</span>
          ) : conectado === true ? (
            <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={16} /> Conectado
            </span>
          ) : conectado === false ? (
            <span className="flex items-center gap-1.5 font-medium text-accent-600 dark:text-accent-400">
              <AlertCircle size={16} /> Desconectado
            </span>
          ) : (
            <span className="text-gray-400">Status não reconhecido — veja a resposta técnica abaixo.</span>
          )}
          <button
            type="button"
            onClick={buscarStatus}
            title="Atualizar status"
            className="rounded-lg p-1 text-gray-400 transition hover:bg-brand-50 hover:text-brand-600"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

        {qrCode && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-4 dark:border-white/10 dark:bg-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element -- vem como data: URI gerado na hora, não é um arquivo estático */}
            <img src={qrCode} alt="QR code para conectar o WhatsApp" className="h-56 w-56 rounded-lg bg-white p-2" />
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">
              Abra o WhatsApp da farmácia → Aparelhos conectados → Conectar um aparelho, e aponte a câmera pra cá.
            </p>
          </div>
        )}

        <Button type="button" size="sm" onClick={gerarQrCode} disabled={gerandoQr}>
          <QrCode size={15} /> {gerandoQr ? "Gerando..." : "Gerar QR code"}
        </Button>

        {(statusDados !== null || qrDados !== null) && (
          <details className="text-xs text-gray-400">
            <summary className="cursor-pointer select-none">Resposta técnica (se o QR não aparecer, mande print disto)</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-gray-50 p-2 dark:bg-white/5">
              {JSON.stringify({ status: statusDados, conectar: qrDados }, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </Card>
  );
}
