import { MessageCircle, Sparkles } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradiente-marca text-white shadow-brilho-marca">
        <MessageCircle size={30} />
      </div>
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Selecione uma conversa</p>
      <p className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
        <Sparkles size={13} className="text-accent-400" />A Vitória continua respondendo enquanto isso
      </p>
    </div>
  );
}
