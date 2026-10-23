import { workflow, node, trigger, ifElse, languageModel, expr } from '@n8n/workflow-sdk';

// Follow-up de conversa sem resposta (Farmácia Preço Bom).
// O fluxo "Receber Mensagem" grava farmacia_<tel>_followup no Redis quando a IA
// termina de responder e apaga a chave em qualquer mensagem nova. Este fluxo
// roda a cada minuto e manda o 1º follow-up 15 min depois da IA e o 2º 15 min
// depois do 1º — só dentro do horário de funcionamento.

const REDIS = { redis: { id: 'e2eRXUcbgqilvX05', name: 'ivaodonto' } };
const SUPABASE = { httpCustomAuth: { id: 'X5QBUsSycN3oLuik', name: 'Supabase Farmácia (service_role)' } };
const UAZAPI = { httpHeaderAuth: { id: 'XgsrYLbkClFjkllj', name: 'UAZAPI Farmácia (token da instância)' } };
const CRM = { httpHeaderAuth: { id: 'YYMTcv42GmipG4Vu', name: 'Header Auth account 3' } };

const aCadaMinuto = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.2,
  config: {
    name: 'A cada minuto',
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 1 }] } }
  }
});

const lerFollowups = node({
  type: 'n8n-nodes-base.redis',
  version: 1,
  config: {
    name: 'Ler follow-ups',
    parameters: { operation: 'keys', keyPattern: 'farmacia_*_followup', getValues: true },
    credentials: REDIS
  }
});

const separarVencidos = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Separar vencidos',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: `// Horário de funcionamento (America/Bahia). Para mudar, altere aqui.
const INICIO = 7 * 60 + 30; // 7:30
const FIM = 20 * 60 + 30;   // 20:30
const ETAPAS = 2;           // quantos follow-ups no máximo

const agora = new Date();
const partes = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(agora);
const minutoDoDia = Number(partes.find(p => p.type === 'hour').value) * 60 + Number(partes.find(p => p.type === 'minute').value);
const dentroDoHorario = minutoDoDia >= INICIO && minutoDoDia < FIM;

const saida = [];
for (const [chave, bruto] of Object.entries($input.first().json || {})) {
  if (!chave.endsWith('_followup')) continue;
  let estado;
  try { estado = JSON.parse(bruto); } catch (e) {
    saida.push({ json: { chave, acao: 'cancelar', motivo: 'valor inválido no Redis' } });
    continue;
  }
  // Outra execução já pegou este follow-up e ainda está cuidando dele.
  if (estado.processando_ate && new Date(estado.processando_ate) > agora) continue;
  if (!estado.proximo_em || new Date(estado.proximo_em) > agora) continue;

  const etapaAtual = (Number(estado.etapa) || 0) + 1;
  if (!dentroDoHorario) {
    // Não acumula pro dia seguinte: fora do horário, o follow-up é descartado.
    saida.push({ json: { chave, ...estado, acao: 'cancelar', motivo: 'fora do horário de funcionamento' } });
    continue;
  }
  if (etapaAtual > ETAPAS) {
    saida.push({ json: { chave, ...estado, acao: 'cancelar', motivo: 'todas as etapas já enviadas' } });
    continue;
  }
  const telNorm = chave.slice('farmacia_'.length, -'_followup'.length);
  saida.push({ json: { chave, ...estado, tel_norm: telNorm, etapa_atual: etapaAtual, ultima_etapa: etapaAtual >= ETAPAS, acao: 'enviar' } });
}
return saida;`
    }
  }
});

const enviarOuCancelar = ifElse({
  version: 2.2,
  config: {
    name: 'Enviar ou cancelar?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.acao }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'enviar' }],
        combinator: 'and'
      }
    }
  }
});

const cancelarFollowup = node({
  type: 'n8n-nodes-base.redis',
  version: 1,
  config: {
    name: 'Cancelar follow-up',
    parameters: { operation: 'delete', key: expr('{{ $json.chave }}') },
    credentials: REDIS
  }
});

const marcarProcessando = node({
  type: 'n8n-nodes-base.redis',
  version: 1,
  config: {
    name: 'Marcar processando',
    parameters: {
      operation: 'set',
      key: expr('{{ $json.chave }}'),
      value: expr("{{ JSON.stringify({ etapa: $json.etapa, intervalo_min: $json.intervalo_min, agendado_em: $json.agendado_em, proximo_em: $json.proximo_em, chatid: $json.chatid, celular: $json.celular, nome: $json.nome, conversa_id: $json.conversa_id, processando_ate: $now.plus({ minutes: 5 }).toUTC().toISO() }) }}"),
      expire: true,
      ttl: 7200
    },
    credentials: REDIS
  }
});

const checarPausa = node({
  type: 'n8n-nodes-base.redis',
  version: 1,
  config: {
    name: 'Checar pausa (Redis)',
    parameters: {
      operation: 'get',
      propertyName: 'isblocked',
      key: expr("farmacia_{{ $('Separar vencidos').item.json.tel_norm }}_block"),
      options: { dotNotation: false }
    },
    credentials: REDIS
  }
});

const buscarConversa = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Buscar conversa (CRM)',
    parameters: {
      method: 'GET',
      url: expr("https://fmujfsbkrliyiltvdvts.supabase.co/rest/v1/conversas?id=eq.{{ $('Separar vencidos').item.json.conversa_id || '00000000-0000-0000-0000-000000000000' }}&select=status,cliente:clientes(nome,aceita_campanhas,ia_bloqueada),mensagens(remetente,conteudo,criado_em)&mensagens.order=criado_em.desc&mensagens.limit=20"),
      authentication: 'genericCredentialType',
      genericAuthType: 'httpCustomAuth',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Accept', value: 'application/vnd.pgrst.object+json' }] },
      // O PostgREST responde application/vnd.pgrst.object+json, que o N8N não lê
      // como JSON sozinho.
      options: { response: { response: { neverError: true, responseFormat: 'json' } } }
    },
    credentials: SUPABASE
  }
});

const montarContexto = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Pode mandar?',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: `// Decide se o follow-up ainda faz sentido e monta o histórico pra IA.
const estado = $('Separar vencidos').item.json;
const pausaRedis = $('Checar pausa (Redis)').item.json.isblocked;
const conversa = $json || {};
let motivo = null;

if (!conversa.status) motivo = 'conversa não encontrada no CRM';
else if (pausaRedis) motivo = 'IA pausada (atendente respondeu)';
else if (conversa.status !== 'aberta') motivo = 'conversa ' + conversa.status;
else if (conversa.cliente && conversa.cliente.ia_bloqueada) motivo = 'IA bloqueada no CRM';
else if (conversa.cliente && conversa.cliente.aceita_campanhas === false) motivo = 'cliente pediu pra não receber mensagens';

const mensagens = (conversa.mensagens || []).slice().sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1));
const ultima = mensagens[mensagens.length - 1];
if (!motivo && (!ultima || ultima.remetente !== 'ia')) motivo = 'a última mensagem da conversa não é da IA';
// A Vitória termina com pergunta toda mensagem que espera resposta. Sem pergunta
// (despedida, confirmação final, aviso), a conversa não está parada esperando o cliente.
if (!motivo && !String(ultima.conteudo || '').includes('?')) motivo = 'a última mensagem da IA não esperava resposta';

const quem = { cliente: 'Cliente', ia: 'Vitória (IA)', funcionaria: 'Atendente' };
const historico = mensagens.map(m => (quem[m.remetente] || m.remetente) + ': ' + m.conteudo).join('\\n');
const nome = (conversa.cliente && conversa.cliente.nome) || estado.nome || '';
// Nome que é só número (cliente sem nome no WhatsApp) não serve pra chamar a pessoa.
const nomeCliente = /[A-Za-zÀ-ú]/.test(nome) ? nome.split(' ')[0] : '';

return { json: { ...estado, pode_enviar: !motivo, motivo, historico, nome_cliente: nomeCliente } };`
    }
  }
});

const podeMandar = ifElse({
  version: 2.2,
  config: {
    name: 'Ainda faz sentido?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.pode_enviar }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const modelo = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  version: 1.2,
  config: {
    name: 'OpenAI (follow-up)',
    parameters: { model: { __rl: true, value: 'gpt-5-mini', mode: 'list', cachedResultName: 'gpt-5-mini' }, options: {} },
    credentials: { openAiApi: { id: 'L64gVmop4Jr2m2mv', name: 'OpenAI account 2' } }
  }
});

const escreverFollowup = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.7,
  config: {
    name: 'Escrever follow-up (IA)',
    parameters: {
      promptType: 'define',
      text: expr(`Etapa do follow-up: {{ $json.etapa_atual }} de 2
Nome do cliente: {{ $json.nome_cliente || '(não informado — não invente nome)' }}

Conversa até agora (mais antiga primeiro):
{{ $json.historico }}`),
      messages: {
        messageValues: [{
          type: 'SystemMessagePromptTemplate',
          message: `Você é a Vitória, atendente virtual (IA) da Farmácia Preço Bom, em Salvador/BA, no WhatsApp. O cliente parou de responder. Sua tarefa é decidir se vale mandar UMA mensagem curta de follow-up e, se valer, escrevê-la.

PASSO 1 — DECIDA PRIMEIRO. Responda exatamente NAO_ENVIAR (só isso) se QUALQUER um destes for verdade:
- o cliente já sinalizou que vai voltar depois, vai pensar, vai ver com alguém, vai passar na loja ou que te avisa;
- o cliente agradeceu encerrando, se despediu ou disse que não quer;
- o pedido já foi finalizado e confirmado;
- a última mensagem da Vitória foi despedida, confirmação final ou aviso que não esperava resposta;
- o cliente foi transferido pra atendente humana, houve reclamação, sinal de alerta de saúde ou pedido pra parar de mandar mensagem.
Na dúvida, NAO_ENVIAR.

PASSO 2 — se for mandar, escreva a mensagem:
- Retome o assunto concreto que ficou pendente (o produto, a dúvida ou o próximo passo do pedido). Nada de mensagem genérica.
- UMA linha só (no máximo 2 bem curtas), tom acolhedor e baiano no jeito, 1 ou 2 emojis, sem empilhar.
- Use o primeiro nome do cliente só se ele estiver informado. Não se apresente de novo e não diga que é follow-up, lembrete ou mensagem automática.
- Não repita a mensagem anterior nem o preço; só cite o produto.
- NUNCA invente preço, estoque, promoção, prazo, bairro ou taxa.
- Não pressione em assunto de saúde sensível e não insista em medicamento controlado/antibiótico.

Etapa 1 (15 min sem resposta): toque leve perguntando se a pessoa ainda está aí + UMA pergunta simples que destrave o próximo passo. Não se despeça.
Exemplo: "Ana, ainda tá por aí? 😊 Quer que eu já separe a Dipirona pra você?"

Etapa 2 (30 min sem resposta, última mensagem): encerramento gentil, sem pergunta e sem pressão, dizendo que é só chamar quando quiser continuar.
Exemplo: "Vou deixar seu pedido da Dipirona anotado por aqui, Ana 💙 Quando quiser continuar é só me chamar!"

Responda só com NAO_ENVIAR ou com o texto da mensagem, sem aspas e sem explicação.`
        }]
      }
    },
    subnodes: { model: modelo }
  }
});

const tratarResposta = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Tratar resposta da IA',
    parameters: {
      mode: 'runOnceForEachItem',
      jsCode: `const estado = $('Pode mandar?').item.json;
let texto = String($json.text || '').trim().replace(/^["“”']+|["“”']+$/g, '').trim();
const enviar = texto.length > 0 && !/NAO_ENVIAR|NÃO_ENVIAR/i.test(texto);
return { json: { ...estado, texto, enviar, motivo: enviar ? null : 'a IA avaliou que não faz sentido mandar' } };`
    }
  }
});

const iaQuerMandar = ifElse({
  version: 2.2,
  config: {
    name: 'IA quer mandar?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.enviar }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const reconfirmar = node({
  type: 'n8n-nodes-base.redis',
  version: 1,
  config: {
    name: 'Reconfirmar follow-up',
    parameters: { operation: 'get', propertyName: 'atual', key: expr('{{ $json.chave }}'), options: { dotNotation: false } },
    credentials: REDIS
  }
});

const aindaPendente = ifElse({
  version: 2.2,
  config: {
    name: 'Cliente ainda não respondeu?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{
          leftValue: expr("{{ (() => { try { return JSON.parse($json.atual).agendado_em === $('Tratar resposta da IA').item.json.agendado_em; } catch (e) { return false; } })() }}"),
          operator: { type: 'boolean', operation: 'true', singleValue: true }
        }],
        combinator: 'and'
      }
    }
  }
});

const respondeuAntes = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Respondeu antes (não envia)' }
});

const enviarWhatsapp = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Enviar WhatsApp (uazapi)',
    onError: 'continueErrorOutput',
    parameters: {
      method: 'POST',
      url: 'https://flycontrol.uazapi.com/send/text',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Accept', value: 'application/json' }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ (() => { const e = $('Tratar resposta da IA').item.json; const numero = String(e.chatid || '').includes('@s.whatsapp.net') ? e.chatid : String(e.celular || '').replace(/\\D/g, ''); return JSON.stringify({ number: numero, text: e.texto, delay: 3000, track_source: 'crm_followup', track_id: (e.conversa_id || e.tel_norm) + ':' + e.etapa_atual }); })() }}"),
      options: { timeout: 30000 }
    },
    credentials: UAZAPI
  }
});

const registrarCrm = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Registrar no CRM',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://conectfly-crm-farmacia.lnuwza.easypanel.host/api/webhooks/mensagem',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr("{{ JSON.stringify({ cliente: { nome: $('Tratar resposta da IA').item.json.nome || undefined, telefone: $('Tratar resposta da IA').item.json.celular, origem_chat: 'whatsapp' }, remetente: 'ia', conteudo: $('Tratar resposta da IA').item.json.texto, tipo: 'texto' }) }}"),
      options: {}
    },
    credentials: CRM
  }
});

const gravarMemoria = node({
  type: 'n8n-nodes-base.redis',
  version: 1,
  config: {
    name: 'Gravar na memória da IA',
    onError: 'continueRegularOutput',
    parameters: {
      operation: 'push',
      list: expr("farmacia_{{ $('Tratar resposta da IA').item.json.celular }}"),
      messageData: expr("{{ JSON.stringify({ type: 'ai', data: { content: $('Tratar resposta da IA').item.json.texto, tool_calls: [], invalid_tool_calls: [], additional_kwargs: {}, response_metadata: {} } }) }}"),
      tail: false
    },
    credentials: REDIS
  }
});

const temProxima = ifElse({
  version: 2.2,
  config: {
    name: 'Tem próxima etapa?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr("{{ $('Tratar resposta da IA').item.json.ultima_etapa }}"), operator: { type: 'boolean', operation: 'false', singleValue: true } }],
        combinator: 'and'
      }
    }
  }
});

const agendarProxima = node({
  type: 'n8n-nodes-base.redis',
  version: 1,
  config: {
    name: 'Agendar próximo follow-up',
    parameters: {
      operation: 'set',
      key: expr("{{ $('Tratar resposta da IA').item.json.chave }}"),
      value: expr("{{ (() => { const e = $('Tratar resposta da IA').item.json; return JSON.stringify({ etapa: e.etapa_atual, intervalo_min: e.intervalo_min || 15, agendado_em: e.agendado_em, proximo_em: $now.plus({ minutes: e.intervalo_min || 15 }).toUTC().toISO(), chatid: e.chatid, celular: e.celular, nome: e.nome, conversa_id: e.conversa_id }); })() }}"),
      expire: true,
      ttl: 7200
    },
    credentials: REDIS
  }
});

const encerrar = node({
  type: 'n8n-nodes-base.redis',
  version: 1,
  config: {
    name: 'Encerrar follow-up',
    parameters: { operation: 'delete', key: expr("{{ $('Tratar resposta da IA').item.json.chave }}") },
    credentials: REDIS
  }
});

// Saída de erro do "Enviar WhatsApp (uazapi)" (ligada no N8N com
// addConnection sourceIndex 1). A doc da uazapi pede pra não reenviar sozinho
// depois de falha, então o follow-up é descartado.
// Configurações do fluxo no N8N: timezone America/Bahia, executionOrder v1.
const falhaEnvio = node({
  type: 'n8n-nodes-base.redis',
  version: 1,
  config: {
    name: 'Falha no envio: cancelar',
    parameters: { operation: 'delete', key: expr("{{ $('Tratar resposta da IA').item.json.chave }}") },
    credentials: REDIS
  }
});

export default workflow('followup-sem-resposta', 'Farmácia Preço Bom - Follow-up sem resposta')
  .add(falhaEnvio)
  .add(aCadaMinuto)
  .to(lerFollowups)
  .to(separarVencidos)
  .to(enviarOuCancelar
    .onTrue(marcarProcessando
      .to(checarPausa)
      .to(buscarConversa)
      .to(montarContexto)
      .to(podeMandar
        .onTrue(escreverFollowup
          .to(tratarResposta)
          .to(iaQuerMandar
            .onTrue(reconfirmar
              .to(aindaPendente
                .onTrue(enviarWhatsapp
                  .to(registrarCrm
                    .to(gravarMemoria)
                    .to(temProxima
                      .onTrue(agendarProxima)
                      .onFalse(encerrar))))
                .onFalse(respondeuAntes)))
            .onFalse(cancelarFollowup)))
        .onFalse(cancelarFollowup)))
    .onFalse(cancelarFollowup));
