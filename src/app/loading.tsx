import { Spinner } from "@/components/ui/Spinner";

export default function RootLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F5F6FA] dark:bg-[#0A0F1E]">
      <Spinner size={32} />
    </div>
  );
}
