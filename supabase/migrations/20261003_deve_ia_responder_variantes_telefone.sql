-- ============================================================================
-- Trava da IA que reconhece o mesmo telefone escrito de jeitos diferentes
--
-- Problema: `deve_ia_responder` comparava o telefone EXATAMENTE como veio. O
-- WhatsApp entrega o mesmo número ora com o 9 do celular, ora sem, ora com o
-- "55" na frente, ora sem — e o cadastro do cliente no CRM pode ter vindo de
-- outro lugar (campanha, cadastro manual) no outro formato. Quando os dois
-- lados não batiam, a função não achava o cliente, devolvia `true` ("pode
-- responder") e a trava da conversa/bloqueio do número era ignorada: a IA
-- seguia respondendo por cima do atendente.
--
-- O que esta migração faz (só ADICIONA/SUBSTITUI funções e cria um índice —
-- nenhuma tabela, coluna ou linha existente é alterada ou removida):
-- 1. `telefone_chave_br(text)`: tira o "55" e o 9 extra do celular, deixando
--    só DDD + 8 dígitos. Mesma regra de `chaveTelefoneBR` (src/lib/telefone.ts)
--    e das chaves de bloqueio do N8N.
-- 2. Índice em cima dessa chave, pra busca continuar rápida.
-- 3. `deve_ia_responder` reescrita (create or replace, mesma assinatura — o
--    N8N continua chamando igual): olha TODOS os clientes que batem com a
--    chave. Se qualquer um estiver com IA bloqueada, ou com a conversa mais
--    recente "aguardando_humano", devolve false.
--
-- Rodar no SQL editor do Supabase. Pode rodar mais de uma vez sem problema.
-- ============================================================================

create or replace function telefone_chave_br(telefone text)
returns text as $$
declare
  v_digitos text := regexp_replace(coalesce(telefone, ''), '[^0-9]', '', 'g');
begin
  if length(v_digitos) >= 12 and left(v_digitos, 2) = '55' then
    v_digitos := substr(v_digitos, 3);
  end if;
  if length(v_digitos) = 11 and substr(v_digitos, 3, 1) = '9' then
    v_digitos := substr(v_digitos, 1, 2) || substr(v_digitos, 4);
  end if;
  return v_digitos;
end;
$$ language plpgsql immutable;

create index if not exists idx_clientes_telefone_chave on clientes (telefone_chave_br(telefone));

create or replace function deve_ia_responder(telefone_busca text)
returns boolean as $$
declare
  v_chave text := telefone_chave_br(telefone_busca);
  v_cliente record;
  v_status_conversa text;
begin
  -- Telefone vazio/inválido não identifica ninguém: deixa seguir como antes
  -- (cliente novo, ainda sem cadastro, a IA pode responder).
  if v_chave = '' then
    return true;
  end if;

  for v_cliente in
    select id, ia_bloqueada
    from clientes
    where telefone_chave_br(telefone) = v_chave
  loop
    if v_cliente.ia_bloqueada then
      return false;
    end if;

    select status into v_status_conversa
    from conversas
    where cliente_id = v_cliente.id
    order by criado_em desc
    limit 1;

    -- 'aguardando_humano' é a trava da conversa atual: setada pelo botão de
    -- travar no Chat, por resposta da equipe no CRM e, agora, por resposta
    -- dada direto pelo celular da farmácia (ver /api/webhooks/mensagem).
    if coalesce(v_status_conversa, 'aberta') = 'aguardando_humano' then
      return false;
    end if;
  end loop;

  return true;
end;
$$ language plpgsql stable;
