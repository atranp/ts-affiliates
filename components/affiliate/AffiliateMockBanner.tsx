"use client";

import { FlaskConical } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { isMockAuthUser } from "@/lib/mock/affiliate-auth";

export function AffiliateMockBanner() {
  const { user } = useAuth();

  if (!isMockAuthUser(user)) return null;

  return (
    <div className="border-b border-amber-300/80 bg-amber-50 px-3 py-2 text-center text-[11px] leading-snug text-pretty text-amber-950 sm:px-4 sm:text-sm">
      <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-medium">
        <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
        UI mock mode — fixture data only. Set{" "}
        <code className="rounded bg-amber-100/80 px-1 py-0.5 font-mono text-[11px]">
          AFFILIATE_MOCK_DATA=false
        </code>{" "}
        to use real auth.
      </span>
    </div>
  );
}
