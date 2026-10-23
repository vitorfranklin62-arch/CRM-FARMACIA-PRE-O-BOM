"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  QrCode,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Hash,
  LogOut,
  Loader2,
  Copy,
  Check,
  PauseCircle,
  BadgeCheck,
} from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { formatarTelefone } from "@/lib/telefone";
import type { EstadoWhatsapp } from "@/lib/uazapi";

type RespostaApi = { estado?: EstadoWhatsapp; dados?: unknown; error?: string; detalhe?: unknown; configurado?: boolean };
type Modo = "qr" | "codigo";

/** Enquanto espera o celular, checa o status a cada 3s (o QR muda sozinho nesse meio tempo). */
const INTERVALO_MS = 3_000;
/** Depois de 2 min sem conectar, para de checar e pede um QR/código novo. */
const LIMITE_ESPERA_MS = 120_000;

/**
 * Lê a resposta como texto e só depois tenta JSON — se um proxy na frente do
 * servidor devolver uma página de erro HTML, a tela mostra o texto bruto em
 * vez de uma mensagem genérica sem explicação.
 */
async function lerResposta(res: Response): Promise<{ json: RespostaApi | null; bruto: string }> {
  const bruto = await res.text();
  try {
    return { json: JSON.parse(bruto), bruto };
  } catch {
    return { json: null, bruto };
  }
}

function detalheDoErro(res: Response, json: RespostaApi | null, bruto: string): string {
  const detalhe = json?.detalhe !== undefined ? JSON.stringify(json.detalhe) : bruto;
  return `HTTP ${res.status}${detalhe && detalhe !== "null" ? ` — ${detalhe.slice(0, 500)}` : ""}`;
}

const VISUAL = {
  conectado: {
    titulo: "WhatsApp conectado",
    texto: "A IA e o Chat ao vivo estão enviando e recebendo mensagens normalmente.",
    icone: CheckCircle2,
    caixa: "from-emerald-500 to-teal-500",
  },
  conectando: {
    titulo: "Aguardando o celular",
    texto: "Siga os passos abaixo no WhatsApp da farmácia. A tela atualiza sozinha quando conectar.",
    icone: Loader2,
    caixa: "from-amber-400 to-orange-500",
  },
  desconectado: {
    titulo: "WhatsApp desconectado",
    texto: "Enquanto estiver desconectado, a IA não responde e o Chat ao vivo não envia mensagens.",
    icone: AlertCircle,
    caixa: "from-accent-500 to-rose-500",
  },
  hibernado: {
    titulo: "Conexão em pausa (hibernada)",
    texto: "A sessão está guardada, mas pausada. Clique em conectar pra reativar.",
    icone: PauseCircle,
    caixa: "from-slate-400 to-slate-500",
  },
  desconhecido: {
    titulo: "Status não reconhecido",
    texto: "A uazapi respondeu num formato inesperado. Veja a resposta técnica no fim do cartão.",
    icone: AlertCircle,
    caixa: "from-slate-400 to-slate-500",
  },
} as const;

export function WhatsappConexaoForm() {
  const [estado, setEstado] = useState<EstadoWhatsapp | null>(null);
  const [respostaBruta, setRespostaBruta] = useState<unknown>(null);
  const [carregando, setCarregando] = useState(true);
  const [acao, setAcao] = useState<"conectar" | "desconectar" | null>(null);
  const [modo, setModo] = useState<Modo>("qr");
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);
  const [semConfig, setSemConfig] = useState(false);
  const [aguardando, setAguardando] = useState(false);
  const [expirou, setExpirou] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const inicioEsperaRef = useRef<number | null>(null);

  const situacao = estado?.situacao ?? null;

  const aplicarResposta = useCallback((json: RespostaApi) => {
    if (json.estado) setEstado(json.estado);
    setRespostaBruta(json.dados ?? null);
    setErro(null);
    setErroDetalhe(null);
    setSemConfig(false);
  }, []);

  const buscarStatus = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true);
      try {
        const res = await fetch("/api/configuracoes/uazapi/status", { cache: "no-store" });
        const { json, bruto } = await lerResposta(res);
        if (!res.ok || !json) {
          setSemConfig(json?.configurado === false);
          setErro(json?.error ?? "Não foi possível consultar o status do WhatsApp.");
          setErroDetalhe(detalheDoErro(res, json, bruto));
          return null;
        }
        aplicarResposta(json);
        return json.estado ?? null;
      } catch (e) {
        setErro("Não foi possível falar com o servidor do CRM.");
        setErroDetalhe(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        if (!silencioso) setCarregando(false);
      }
    },
    [aplicarResposta]
  );

  // Status ao abrir a tela e sempre que a aba volta a ficar visível.
  useEffect(() => {
    buscarStatus();
    function aoVoltar() {
      if (document.visibilityState === "visible") buscarStatus(true);
    }
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [buscarStatus]);

  // Enquanto espera o celular: consulta o status em intervalos (pega QR novo
  // e percebe a conexão) até conectar ou estourar o limite de espera.
  useEffect(() => {
    if (!aguardando) return;
    if (situacao === "conectado") {
      setAguardando(false);
      return;
    }
    const timer = setInterval(async () => {
      const decorrido = Date.now() - (inicioEsperaRef.current ?? Date.now());
      setSegundos(Math.floor(decorrido / 1000));
      if (decorrido > LIMITE_ESPERA_MS) {
        setAguardando(false);
        setExpirou(true);
        return;
      }
      await buscarStatus(true);
    }, INTERVALO_MS);
    return () => clearInterval(timer);
  }, [aguardando, situacao, buscarStatus]);

  async function conectar() {
    setAcao("conectar");
    setErro(null);
    setErroDetalhe(null);
    setExpirou(false);
    try {
      const res = await fetch("/api/configuracoes/uazapi/conectar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modo === "codigo" ? { telefone } : {}),
      });
      const { json, bruto } = await lerResposta(res);
      if (!res.ok || !json) {
        setSemConfig(json?.configurado === false);
        setErro(json?.error ?? "Não foi possível iniciar a conexão.");
        setErroDetalhe(detalheDoErro(res, json, bruto));
        return;
      }
      aplicarResposta(json);
      if (json.estado?.situacao !== "conectado") {
        inicioEsperaRef.current = Date.now();
        setSegundos(0);
        setAguardando(true);
      }
    } catch (e) {
      setErro("Não foi possível falar com o servidor do CRM.");
      setErroDetalhe(e instanceof Error ? e.message : String(e));
    } finally {
      setAcao(null);
    }
  }

  /**
   * Desconecta o número — ou, se ainda estiver só esperando o celular,
   * cancela a tentativa (a uazapi recusa começar outra enquanto uma está em
   * andamento, então trocar de QR pra código passa por aqui).
   */
  async function desconectar(cancelandoTentativa = false) {
    if (
      !cancelandoTentativa &&
      !confirm(
        "Desconectar o WhatsApp da farmácia?\n\nA IA para de responder e o Chat ao vivo para de enviar mensagens até você conectar de novo (vai precisar ler um QR code novo)."
      )
    )
      return;
    setAcao("desconectar");
    setErro(null);
    setErroDetalhe(null);
    try {
      const res = await fetch("/api/configuracoes/uazapi/desconectar", { method: "POST" });
      const { json, bruto } = await lerResposta(res);
      if (!res.ok || !json) {
        setErro(json?.error ?? "Não foi possível desconectar.");
        setErroDetalhe(detalheDoErro(res, json, bruto));
        return;
      }
      aplicarResposta(json);
      setAguardando(false);
    } catch (e) {
      setErro("Não foi possível falar com o servidor do CRM.");
      setErroDetalhe(e instanceof Error ? e.message : String(e));
    } finally {
      setAcao(null);
    }
  }

  async function copiarCodigo(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sem permissão de área de transferência: o código continua visível na tela.
    }
  }

  const visual = situacao ? VISUAL[situacao] : null;
  const IconeStatus = visual?.icone ?? Loader2;
  const mostrarConexao = situacao !== "conectado" && !semConfig;
  const esperandoCelular = situacao === "conectando" && (aguardando || !!estado?.qrcode || !!estado?.paircode) && !expirou;
  const digitosTelefone = telefone.replace(/\D/g, "");

  return (
    <Card comFaixa>
      <CardHeader
        title="Conexão do WhatsApp"
        description="Conecte o número da farmácia pra IA e o Chat ao vivo funcionarem."
        action={
          <button
            type="button"
            onClick={() => buscarStatus()}
            disabled={carregando}
            title="Atualizar status"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition hover:bg-brand-100 disabled:opacity-60 dark:bg-white/10 dark:text-brand-200"
          >
            <RefreshCw size={17} className={cn(carregando && "animate-spin")} />
          </button>
        }
      />

      <div className="space-y-4">
        {/* Faixa de status */}
        {carregando && !estado ? (
          <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-gray-500 dark:bg-white/5 dark:text-gray-400">
            <Loader2 size={18} className="animate-spin" /> Consultando o WhatsApp...
          </div>
        ) : visual && estado ? (
          <div className={cn("relative overflow-hidden rounded-2xl bg-gradient-to-r p-4 text-white shadow-card-md", visual.caixa)}>
            <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
            <div className="relative flex items-center gap-3">
              {situacao === "conectado" ? (
                <Avatar nome={estado.perfil.nome ?? "WhatsApp"} fotoUrl={estado.perfil.fotoUrl} size={48} />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
                  <IconeStatus size={24} className={cn(situacao === "conectando" && "animate-spin")} />
                </span>
              )}
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-bold">
                  {visual.titulo}
                  {situacao === "conectado" && <CheckCircle2 size={16} />}
                </p>
                {situacao === "conectado" && (estado.perfil.nome || estado.perfil.numero) ? (
                  <p className="flex flex-wrap items-center gap-x-2 text-sm text-white/90">
                    {estado.perfil.nome && <span className="font-semibold">{estado.perfil.nome}</span>}
                    {estado.perfil.numero && <span>{formatarTelefone(estado.perfil.numero)}</span>}
                    {estado.perfil.business && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-white/20 px-1.5 text-[10px] font-semibold">
                        <BadgeCheck size={11} /> Business
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-white/85">{visual.texto}</p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {situacao === "desconectado" && estado?.ultimaDesconexao.motivo && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Última desconexão: <span className="font-medium">{estado.ultimaDesconexao.motivo}</span>
            {estado.ultimaDesconexao.quando && ` (${estado.ultimaDesconexao.quando})`}
          </p>
        )}

        {erro && (
          <div className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-200/70 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20">
            <p className="flex items-start gap-1.5 font-medium">
              <AlertCircle size={16} className="mt-0.5 shrink-0" /> {erro}
            </p>
            {semConfig && (
              <p className="mt-1 text-xs">
                Peça pra quem cuida do servidor cadastrar o endereço (UAIZAP_BASE_URL) e o token da instância (UAIZAP_API_KEY) e reiniciar o sistema.
              </p>
            )}
            {erroDetalhe && <p className="mt-1 break-all font-mono text-[11px] text-red-500/80">{erroDetalhe}</p>}
          </div>
        )}

        {/* Esperando o celular: QR code ou código de pareamento */}
        {esperandoCelular && (estado?.qrcode || estado?.paircode) && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 p-4 dark:border-white/10 dark:bg-white/5">
            {estado?.qrcode && !estado.paircode && (
              // eslint-disable-next-line @next/next/no-img-element -- vem como data: URI gerado na hora, não é um arquivo estático
              <img src={estado.qrcode} alt="QR code para conectar o WhatsApp" className="h-60 w-60 rounded-xl bg-white p-2 shadow-card" />
            )}
            {estado?.paircode && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Código de pareamento</p>
                <button
                  type="button"
                  onClick={() => copiarCodigo(estado.paircode!)}
                  title="Copiar código"
                  className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-mono text-2xl font-bold tracking-[0.2em] text-gray-900 shadow-card ring-1 ring-brand-100 transition hover:ring-brand-300 dark:bg-white/10 dark:text-white dark:ring-white/10"
                >
                  {estado.paircode}
                  {copiado ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} className="text-gray-400" />}
                </button>
              </div>
            )}
            <ol className="w-full max-w-sm list-decimal space-y-1 pl-5 text-xs text-gray-600 dark:text-gray-300">
              <li>Abra o WhatsApp no celular da farmácia.</li>
              <li>
                Toque em <strong>⋮ / Configurações</strong> → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong>.
              </li>
              {estado?.paircode ? (
                <li>
                  Toque em <strong>Conectar com número de telefone</strong> e digite o código acima.
                </li>
              ) : (
                <li>Aponte a câmera do celular pra este QR code.</li>
              )}
            </ol>
            {aguardando && (
              <p className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                <Loader2 size={12} className="animate-spin" /> Esperando a leitura... ({Math.max(0, Math.round((LIMITE_ESPERA_MS / 1000) - segundos))}s)
              </p>
            )}
          </div>
        )}

        {expirou && situacao !== "conectado" && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20">
            O tempo pra ler o QR/código acabou. Clique em conectar de novo pra gerar um novo.
          </p>
        )}

        {/* Escolha de como conectar + botão */}
        {mostrarConexao && !esperandoCelular && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
              {(
                [
                  { valor: "qr", label: "QR code", icone: QrCode },
                  { valor: "codigo", label: "Código pelo número", icone: Hash },
                ] as const
              ).map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  onClick={() => setModo(m.valor)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition",
                    modo === m.valor
                      ? "bg-white text-brand-700 shadow-sm dark:bg-white/15 dark:text-white"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  )}
                >
                  <m.icone size={14} /> {m.label}
                </button>
              ))}
            </div>

            {modo === "codigo" && (
              <div>
                <Input
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="Número do WhatsApp da farmácia, ex.: (71) 99937-3863"
                  inputMode="tel"
                />
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                  Use quando não der pra apontar a câmera: o celular pede um código de 8 letras/números.
                </p>
              </div>
            )}

            <Button
              type="button"
              onClick={conectar}
              disabled={acao !== null || (modo === "codigo" && digitosTelefone.length < 10)}
              className="w-full"
            >
              {acao === "conectar" ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Gerando...
                </>
              ) : modo === "qr" ? (
                <>
                  <QrCode size={15} /> Gerar QR code
                </>
              ) : (
                <>
                  <Smartphone size={15} /> Gerar código de pareamento
                </>
              )}
            </Button>
          </div>
        )}

        {esperandoCelular && (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => buscarStatus()} className="flex-1">
              <RefreshCw size={14} /> Já li, verificar agora
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => desconectar(true)} disabled={acao !== null}>
              {acao === "desconectar" ? "Cancelando..." : "Cancelar / trocar forma"}
            </Button>
          </div>
        )}

        {situacao === "conectado" && (
          <Button type="button" variant="danger" size="sm" onClick={() => desconectar()} disabled={acao !== null}>
            {acao === "desconectar" ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
            {acao === "desconectar" ? "Desconectando..." : "Desconectar WhatsApp"}
          </Button>
        )}

        {respostaBruta !== null && (
          <details className="text-xs text-gray-400">
            <summary className="cursor-pointer select-none">Resposta técnica da uazapi (pra suporte)</summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-gray-50 p-2 dark:bg-white/5">
              {JSON.stringify(respostaBruta, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </Card>
  );
}
