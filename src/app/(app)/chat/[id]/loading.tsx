import { SkeletonConversa } from "@/components/chat/Skeletons";

// Aparece na hora ao trocar de conversa, enquanto o servidor monta o cabeçalho e a ficha.
export default function Loading() {
  return <SkeletonConversa />;
}
