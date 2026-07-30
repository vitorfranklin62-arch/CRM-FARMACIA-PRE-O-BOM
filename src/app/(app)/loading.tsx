import { Spinner } from "@/components/ui/Spinner";

export default function Loading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <Spinner size={32} />
      <p className="text-sm text-gray-400 dark:text-gray-500">Carregando...</p>
    </div>
  );
}
