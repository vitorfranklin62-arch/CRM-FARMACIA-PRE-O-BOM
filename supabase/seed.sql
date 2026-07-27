-- ============================================================================
-- Dados de exemplo (opcional) — rodar depois do schema.sql para testar o painel
-- ============================================================================

insert into templates_mensagem (titulo, conteudo, categoria) values
  ('Confirmação de pedido', 'Seu pedido foi confirmado! Já estamos separando os produtos. 💊', 'confirmacao'),
  ('Promoção do dia', 'Hoje temos desconto especial em vitaminas e suplementos! Aproveite. 🎉', 'promocao'),
  ('Horário de funcionamento', 'Funcionamos de segunda a sábado, das 08h às 20h.', 'duvida'),
  ('Agradecimento', 'Obrigado pela preferência! Volte sempre. ❤️', 'outro')
on conflict do nothing;

insert into produtos (nome, laboratorio, preco, estoque, sku) values
  ('Dipirona 500mg 20cp', 'EMS', 8.90, 120, 'SKU-0001'),
  ('Paracetamol 750mg 20cp', 'Neo Química', 12.50, 80, 'SKU-0002'),
  ('Vitamina C 1g 10cp efervescente', 'Sandoz', 19.90, 45, 'SKU-0003'),
  ('Protetor Solar FPS 60 120ml', 'La Roche-Posay', 89.90, 15, 'SKU-0004'),
  ('Omeprazol 20mg 28cp', 'Eurofarma', 15.30, 60, 'SKU-0005')
on conflict do nothing;
