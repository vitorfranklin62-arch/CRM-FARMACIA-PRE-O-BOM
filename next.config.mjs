// Os headers de segurança (CSP, HSTS, X-Frame-Options, etc.) são aplicados no
// middleware (src/lib/supabase/middleware.ts), não aqui — a CSP precisa de um
// nonce novo a cada requisição, o que só é possível em middleware, não em
// configuração estática. Ver a função applySecurityHeaders() nesse arquivo.

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: supabaseHostname
      ? [{ protocol: "https", hostname: supabaseHostname, pathname: "/storage/v1/object/public/**" }]
      : [],
  },
};

export default nextConfig;
