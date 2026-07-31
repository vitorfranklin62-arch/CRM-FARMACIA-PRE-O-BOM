"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function ImprimirButton() {
  return (
    <Button size="sm" onClick={() => window.print()}>
      <Printer size={15} /> Imprimir
    </Button>
  );
}
