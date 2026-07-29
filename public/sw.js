// Service worker mínimo — só existe pra habilitar "instalar app" no navegador.
// Não faz cache de nada: o painel depende de dados ao vivo do Supabase e cada
// página é renderizada com um nonce novo por requisição (parte da política de
// segurança CSP). Cachear HTML aqui serviria conteúdo/nonce desatualizado e
// quebraria o app. Fora do ar, o app simplesmente não funciona — é o
// esperado para um CRM que depende de dados em tempo real.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // intencionalmente vazio — deixa o navegador buscar tudo direto da rede
});
