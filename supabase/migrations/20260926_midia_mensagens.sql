-- ============================================================================
-- Mídia nas mensagens: cliente manda foto, áudio ou PDF pelo WhatsApp e a
-- equipe consegue ver/ouvir/abrir isso direto no Chat ao vivo do CRM.
--
-- Guarda o arquivo de verdade num bucket PRIVADO do Storage (diferente do
-- bucket `branding`, que é público) porque aqui pode vir foto de receita
-- médica ou documento pessoal do cliente — só quem está logada no painel
-- acessa, via link assinado (expira sozinho) gerado na hora de abrir a
-- conversa.
--
-- Esta migração só ADICIONA coisas — nenhuma coluna, tabela ou dado é
-- removido ou reescrito. Rodar no SQL editor do Supabase.
-- ============================================================================

alter table mensagens add column if not exists tipo text not null default 'texto'
  check (tipo in ('texto', 'imagem', 'audio', 'documento'));
alter table mensagens add column if not exists midia_path text;
alter table mensagens add column if not exists midia_nome text;
alter table mensagens add column if not exists midia_mime text;

comment on column mensagens.tipo is
  'Tipo de conteúdo da mensagem. texto = só texto (padrão); imagem/audio/documento = tem arquivo em midia_path, e conteudo carrega a legenda/transcrição/descrição usada pela IA.';
comment on column mensagens.midia_path is
  'Caminho do arquivo dentro do bucket privado "chat-midia" — não é a URL final, pois o bucket não é público. A URL assinada é gerada na hora de exibir a conversa (ver src/lib/chat-midia.ts).';
comment on column mensagens.midia_nome is
  'Nome original do arquivo, usado principalmente pra documentos/PDF na tela.';
comment on column mensagens.midia_mime is
  'Content-Type do arquivo (ex.: image/jpeg, audio/ogg, application/pdf).';

insert into storage.buckets (id, name, public)
values ('chat-midia', 'chat-midia', false)
on conflict (id) do nothing;
