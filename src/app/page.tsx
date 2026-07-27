import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function Home() {
  const usuario = await requireUser();
  redirect(usuario.role === "dona" ? "/dashboard" : "/pedidos");
}
