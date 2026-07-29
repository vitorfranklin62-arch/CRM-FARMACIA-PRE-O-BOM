// Os headers de segurança (CSP, HSTS, X-Frame-Options, etc.) são aplicados no
// middleware (src/lib/supabase/middleware.ts), não aqui — a CSP precisa de um
// nonce novo a cada requisição, o que só é possível em middleware, não em
// configuração estática. Ver a função applySecurityHeaders() nesse arquivo.

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;
