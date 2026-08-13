-- Cria o bucket de Storage usado pra guardar a foto customizada da Vitória
-- AI (Configurações → Vitória AI → Trocar foto) e outros assets de marca no
-- futuro (ex.: logo). Bucket público: a URL da imagem precisa carregar
-- direto no navegador de qualquer usuária logada, sem exigir sessão.
-- Não é destrutivo — só cria o bucket se ele ainda não existir.
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;
