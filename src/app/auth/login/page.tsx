import { LoginForm } from "./LoginForm";

// Precisa ser renderizada por requisição (não estática): o header
// Content-Security-Policy usa um nonce novo a cada request, gerado no
// middleware, e teria que bater com o nonce embutido no HTML da página.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm />;
}
