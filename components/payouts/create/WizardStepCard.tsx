"use client";

import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";

export function WizardStepCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="ts-payout-step-card overflow-visible">
      <header className="ts-payout-step-head flex items-center gap-3">
        <div className="ts-step-num">{step}</div>
        <h2 className="ts-section-title text-base">{title}</h2>
      </header>
      <div className="ts-payout-step-body overflow-visible">{children}</div>
    </section>
  );
}

export function LoadingLine({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 py-2">
      <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-primary" />
      <p className="ts-row-meta">{children}</p>
    </div>
  );
}
