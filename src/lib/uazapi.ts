/**
 * Conversa com a uazapi (instância do WhatsApp da farmácia) — usada só no
 * servidor, pelas rotas de Configurações → Conexão do WhatsApp. O token da
 * instância (UAIZAP_API_KEY) nunca sai do servidor.
 *
 * Formatos conferidos na documentação oficial (docs.uazapi.com):
 *  GET  /instance/status  → { instance: { status, qrcode, paircode, profileName, ... },
 *                             status: { connected, loggedIn, jid } }
 *  POST /instance/connect → { connected, loggedIn, jid, instance: {...} }
 *                           (body vazio = QR code; body { phone } = código de pareamento)
 *  POST /instance/disconnect
 * instance.status: "disconnected" | "connecting" | "connected" | "hibernated".
 */

export type SituacaoWhatsapp = "conectado" | "conectando" | "desconectado" | "hibernado" | "desconhecido";

export type EstadoWhatsapp = {
  situacao: SituacaoWhatsapp;
  /** QR code pronto pra <img src> (data URI), só enquanto está conectando. */
  qrcode: string | null;
  /** Código de pareamento (conexão pelo número, sem câmera). */
  paircode: string | null;
  perfil: {
    nome: string | null;
    numero: string | null;
    fotoUrl: string | null;
    business: boolean;
  };
  ultimaDesconexao: { quando: string | null; motivo: string | null };
};

export type RespostaUazapi =
  | { ok: true; status: number; dados: unknown }
  | { ok: false; status: number; erro: string; detalhe: unknown };

const TIMEOUT_MS = 15_000;

/** Lê a configuração do servidor; null = falta variável de ambiente. */
export function configUazapi(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.UAIZAP_BASE_URL?.trim();
  const token = process.env.UAIZAP_API_KEY?.trim();
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token };
}

export const ERRO_SEM_CONFIG =
  "UAIZAP_BASE_URL e UAIZAP_API_KEY precisam estar configurados nas variáveis de ambiente do servidor.";

/** Mensagem clara pra cada código de erro que a uazapi documenta. */
function mensagemDeErro(status: number): string {
  if (status === 401) return "A uazapi recusou o token da instância (UAIZAP_API_KEY inválido ou expirado). Confira o token no painel da uazapi.";
  if (status === 404) return "Instância não encontrada. Confira se UAIZAP_BASE_URL e UAIZAP_API_KEY são da mesma instância.";
  if (status === 409) return "Já existe uma conexão em andamento pra esta instância. Aguarde ou leia o QR code que já está na tela.";
  if (status === 429) return "A uazapi atingiu o limite de conexões simultâneas. Tente de novo em alguns minutos.";
  if (status >= 500) return "A uazapi está com erro interno no momento. Tente de novo em alguns minutos.";
  return `A uazapi respondeu com erro (HTTP ${status}).`;
}

/** Chama um endpoint da uazapi com timeout e transforma qualquer falha numa resposta explicada. */
export async function chamarUazapi(
  config: { baseUrl: string; token: string },
  caminho: string,
  opcoes: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {}
): Promise<RespostaUazapi> {
  if (!/^https?:\/\//i.test(config.baseUrl)) {
    return {
      ok: false,
      status: 400,
      erro: "UAIZAP_BASE_URL precisa começar com https:// (ex.: https://suaempresa.uazapi.com).",
      detalhe: null,
    };
  }

  const method = opcoes.method ?? "GET";
  try {
    const res = await fetch(`${config.baseUrl}${caminho}`, {
      method,
      headers: {
        token: config.token,
        Accept: "application/json",
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: method === "POST" ? JSON.stringify(opcoes.body ?? {}) : undefined,
      cache: "no-store",
      // Sem isso, uma uazapi fora do ar deixava a requisição pendurada até o
      // proxy na frente do servidor cortar sozinho, e a tela recebia uma
      // página de erro genérica em vez de uma explicação.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const texto = await res.text();
    let dados: unknown = texto;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      // Resposta não-JSON (página de erro de proxy, por exemplo): repassa o texto.
    }

    if (!res.ok) return { ok: false, status: res.status, erro: mensagemDeErro(res.status), detalhe: dados };
    return { ok: true, status: res.status, dados };
  } catch (erro) {
    const timeout = erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError");
    return {
      ok: false,
      status: timeout ? 504 : 502,
      erro: timeout
        ? `A uazapi não respondeu a tempo (${TIMEOUT_MS / 1000}s). Confira se UAIZAP_BASE_URL está certo e se o servidor está no ar.`
        : "Não foi possível falar com a uazapi. Confira se UAIZAP_BASE_URL está certo.",
      detalhe: erro instanceof Error ? `${erro.message}${erro.cause instanceof Error ? ` (${erro.cause.message})` : ""}` : String(erro),
    };
  }
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
}

/** QR code vem como data URI ("data:image/png;base64,...") ou, em versões antigas, só o base64. */
function normalizarQr(valor: unknown): string | null {
  const qr = texto(valor);
  if (!qr || qr.length < 20) return null;
  return qr.startsWith("data:image") ? qr : `data:image/png;base64,${qr}`;
}

/** jid vem como objeto { user: "5511..." } ou como texto "5511...@s.whatsapp.net" (ou "5511...:12@..."). */
function numeroDoJid(jid: unknown): string | null {
  const obj = objeto(jid);
  const bruto = obj ? texto(obj.user) : texto(jid);
  if (!bruto) return null;
  const digitos = bruto.split("@")[0].split(":")[0].replace(/\D/g, "");
  return digitos.length >= 10 ? digitos : null;
}

/**
 * Junta as respostas de /instance/status e /instance/connect (formatos um
 * pouco diferentes) num estado só que a tela entende. Tolerante a campo
 * faltando — o que não der pra saber vira null/"desconhecido".
 */
export function interpretarEstado(dados: unknown): EstadoWhatsapp {
  const raiz = objeto(dados) ?? {};
  const instancia = objeto(raiz.instance) ?? {};
  // Em /instance/status, `status` é um objeto { connected, loggedIn, jid };
  // em /instance/connect esses campos vêm na raiz. (Tratar `status` como
  // texto era o motivo da tela antiga mostrar "Status não reconhecido".)
  const conexao = objeto(raiz.status) ?? raiz;
  const loggedIn = typeof conexao.loggedIn === "boolean" ? conexao.loggedIn : null;
  const connected = typeof conexao.connected === "boolean" ? conexao.connected : null;
  // `response: "Connecting"` aparece no /instance/connect logo que o pareamento começa.
  const statusTexto = (texto(instancia.status) ?? texto(raiz.status) ?? texto(raiz.response) ?? "").toLowerCase();

  const qrcode = normalizarQr(instancia.qrcode ?? raiz.qrcode ?? raiz.base64);
  const paircode = texto(instancia.paircode) ?? texto(raiz.paircode) ?? texto(raiz.pairingCode);

  let situacao: SituacaoWhatsapp = "desconhecido";
  if (loggedIn === true || (["connected", "open", "online"].includes(statusTexto) && loggedIn !== false)) {
    situacao = "conectado";
  } else if (statusTexto === "connecting" || qrcode || paircode) {
    situacao = "conectando";
  } else if (statusTexto === "hibernated") {
    situacao = "hibernado";
  } else if (statusTexto === "disconnected" || statusTexto === "close" || connected === false || loggedIn === false) {
    situacao = "desconectado";
  }

  const owner = texto(instancia.owner);
  const conectado = situacao === "conectado";

  return {
    situacao,
    qrcode: situacao === "conectando" ? qrcode : null,
    paircode: situacao === "conectando" ? paircode : null,
    perfil: {
      nome: texto(instancia.profileName),
      numero: numeroDoJid(conexao.jid) ?? numeroDoJid(raiz.jid) ?? (owner && /^\d{10,15}$/.test(owner) ? owner : null),
      fotoUrl: conectado ? texto(instancia.profilePicUrl) : null,
      business: instancia.isBusiness === true,
    },
    ultimaDesconexao: {
      quando: texto(instancia.lastDisconnect),
      motivo: texto(instancia.lastDisconnectReason),
    },
  };
}

const CAMPOS_SECRETOS = new Set(["token", "admintoken", "openai_apikey", "apikey", "api_key"]);

/**
 * Cópia da resposta bruta segura pra mandar ao navegador (bloco "Resposta
 * técnica"): a uazapi devolve o token da instância e a chave da OpenAI dentro
 * de `instance`, e isso nunca pode sair do servidor. O QR code (enorme) é
 * encurtado — a tela usa o que já vem em `estado`.
 */
export function respostaSegura(dados: unknown): unknown {
  if (Array.isArray(dados)) return dados.map(respostaSegura);
  const obj = objeto(dados);
  if (!obj) return dados;
  return Object.fromEntries(
    Object.entries(obj).map(([chave, valor]) => {
      if (CAMPOS_SECRETOS.has(chave.toLowerCase())) return [chave, valor ? "[oculto]" : valor];
      if (chave === "qrcode" && typeof valor === "string" && valor.length > 60) return [chave, `${valor.slice(0, 40)}… (${valor.length} caracteres)`];
      return [chave, respostaSegura(valor)];
    })
  );
}
