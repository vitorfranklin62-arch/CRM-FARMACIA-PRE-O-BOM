/**
 * Converte a gravação do navegador (webm/opus no Chrome, mp4 no Safari) para
 * OGG/Opus de verdade — o formato das mensagens de voz do WhatsApp. Não basta
 * renomear o arquivo: a gente decodifica o áudio, recodifica em Opus (WebCodecs)
 * e monta o container OGG na mão (sem biblioteca nova).
 *
 * Roda só no navegador. Se o navegador não tiver WebCodecs de áudio, devolve
 * null e quem chama envia a gravação original.
 */

const TAXA = 48000; // o Opus trabalha em 48 kHz
const SAMPLES_POR_FRAME = 960; // 20 ms
const PRE_SKIP = 312; // atraso padrão do codificador Opus a 48 kHz
const MAX_PACOTES_POR_PAGINA = 40;

function suportaConversaoOggOpus() {
  return typeof AudioEncoder !== "undefined" && typeof AudioData !== "undefined" && typeof OfflineAudioContext !== "undefined";
}

// ---- Container OGG (RFC 3533) + cabeçalhos Opus (RFC 7845) ----

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    tabela[i] = r >>> 0;
  }
  return tabela;
})();

function crcOgg(bytes: Uint8Array) {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) crc = ((crc << 8) ^ TABELA_CRC[((crc >>> 24) & 0xff) ^ bytes[i]]) >>> 0;
  return crc >>> 0;
}

function montarPagina(params: { pacotes: Uint8Array[]; serial: number; sequencia: number; granule: number; inicio: boolean; fim: boolean }) {
  const lacing: number[] = [];
  for (const p of params.pacotes) {
    let restante = p.length;
    while (restante >= 255) {
      lacing.push(255);
      restante -= 255;
    }
    lacing.push(restante);
  }
  const corpo = params.pacotes.reduce((n, p) => n + p.length, 0);
  const pagina = new Uint8Array(27 + lacing.length + corpo);
  const dv = new DataView(pagina.buffer);
  pagina.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  pagina[4] = 0; // versão
  pagina[5] = (params.inicio ? 0x02 : 0) | (params.fim ? 0x04 : 0);
  // granule position de 64 bits (só usamos a parte baixa; gravações têm poucos minutos)
  dv.setUint32(6, params.granule >>> 0, true);
  dv.setUint32(10, Math.floor(params.granule / 2 ** 32) >>> 0, true);
  dv.setUint32(14, params.serial >>> 0, true);
  dv.setUint32(18, params.sequencia, true);
  dv.setUint32(22, 0, true); // CRC entra depois
  pagina[26] = lacing.length;
  pagina.set(lacing, 27);
  let pos = 27 + lacing.length;
  for (const p of params.pacotes) {
    pagina.set(p, pos);
    pos += p.length;
  }
  dv.setUint32(22, crcOgg(pagina), true);
  return pagina;
}

function cabecalhoOpus(canais: number, taxaOriginal: number) {
  const h = new Uint8Array(19);
  h.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0); // "OpusHead"
  h[8] = 1; // versão
  h[9] = canais;
  new DataView(h.buffer).setUint16(10, PRE_SKIP, true);
  new DataView(h.buffer).setUint32(12, taxaOriginal, true);
  new DataView(h.buffer).setUint16(16, 0, true); // ganho
  h[18] = 0; // mapeamento de canais
  return h;
}

function comentariosOpus() {
  const fabricante = new TextEncoder().encode("CRM Farmacia Preco Bom");
  const t = new Uint8Array(8 + 4 + fabricante.length + 4);
  t.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0); // "OpusTags"
  const dv = new DataView(t.buffer);
  dv.setUint32(8, fabricante.length, true);
  t.set(fabricante, 12);
  dv.setUint32(12 + fabricante.length, 0, true); // sem comentários
  return t;
}

/** Junta pacotes Opus (já codificados) num arquivo OGG. */
function montarOggOpus(pacotes: { dados: Uint8Array; samples: number }[], taxaOriginal = TAXA): Uint8Array<ArrayBuffer> {
  const serial = Math.floor(Math.random() * 0xffffffff);
  const paginas: Uint8Array[] = [];
  let sequencia = 0;
  paginas.push(montarPagina({ pacotes: [cabecalhoOpus(1, taxaOriginal)], serial, sequencia: sequencia++, granule: 0, inicio: true, fim: false }));
  paginas.push(montarPagina({ pacotes: [comentariosOpus()], serial, sequencia: sequencia++, granule: 0, inicio: false, fim: false }));

  let granule = PRE_SKIP;
  for (let i = 0; i < pacotes.length; i += MAX_PACOTES_POR_PAGINA) {
    const grupo = pacotes.slice(i, i + MAX_PACOTES_POR_PAGINA);
    granule += grupo.reduce((n, p) => n + p.samples, 0);
    paginas.push(
      montarPagina({
        pacotes: grupo.map((p) => p.dados),
        serial,
        sequencia: sequencia++,
        granule,
        inicio: false,
        fim: i + MAX_PACOTES_POR_PAGINA >= pacotes.length,
      })
    );
  }

  const total = paginas.reduce((n, p) => n + p.length, 0);
  const arquivo = new Uint8Array(total);
  let pos = 0;
  for (const p of paginas) {
    arquivo.set(p, pos);
    pos += p.length;
  }
  return arquivo;
}

// ---- Decodificação, reamostragem e codificação ----

async function decodificarParaMono48k(blob: Blob): Promise<Float32Array> {
  const contexto = new AudioContext();
  try {
    const decodificado = await contexto.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.max(1, Math.ceil(decodificado.duration * TAXA));
    const offline = new OfflineAudioContext(1, frames, TAXA); // 1 canal: o navegador mistura os canais
    const fonte = offline.createBufferSource();
    fonte.buffer = decodificado;
    fonte.connect(offline.destination);
    fonte.start();
    const renderizado = await offline.startRendering();
    return renderizado.getChannelData(0);
  } finally {
    void contexto.close();
  }
}

/**
 * Devolve um Blob audio/ogg (Opus mono 48 kHz) ou null se o navegador não
 * consegue converter. Lança erro se o áudio for ilegível.
 */
export async function converterParaOggOpus(blob: Blob): Promise<Blob | null> {
  if (!suportaConversaoOggOpus()) return null;
  const configuracao: AudioEncoderConfig = { codec: "opus", sampleRate: TAXA, numberOfChannels: 1, bitrate: 32000 };
  const suporte = await AudioEncoder.isConfigSupported(configuracao);
  if (!suporte.supported) return null;

  const pcm = await decodificarParaMono48k(blob);
  if (pcm.length === 0) throw new Error("Áudio vazio.");

  const pacotes: { dados: Uint8Array; samples: number }[] = [];
  let erroDoCodificador: Error | null = null;
  const codificador = new AudioEncoder({
    output: (chunk) => {
      const dados = new Uint8Array(chunk.byteLength);
      chunk.copyTo(dados);
      const samples = chunk.duration ? Math.round((chunk.duration * TAXA) / 1_000_000) : SAMPLES_POR_FRAME;
      pacotes.push({ dados, samples });
    },
    error: (e) => {
      erroDoCodificador = e;
    },
  });
  codificador.configure(configuracao);

  for (let inicio = 0; inicio < pcm.length; inicio += SAMPLES_POR_FRAME) {
    const frame = new Float32Array(SAMPLES_POR_FRAME); // completa o último com silêncio
    frame.set(pcm.subarray(inicio, inicio + SAMPLES_POR_FRAME));
    const dados = new AudioData({
      format: "f32-planar",
      sampleRate: TAXA,
      numberOfFrames: SAMPLES_POR_FRAME,
      numberOfChannels: 1,
      timestamp: Math.round((inicio * 1_000_000) / TAXA),
      data: frame,
    });
    codificador.encode(dados);
    dados.close();
  }
  await codificador.flush();
  codificador.close();

  if (erroDoCodificador) throw erroDoCodificador;
  if (pacotes.length === 0) throw new Error("Não foi possível codificar o áudio.");
  return new Blob([montarOggOpus(pacotes)], { type: "audio/ogg" });
}
