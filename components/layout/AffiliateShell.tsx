"use client";

import { AppShell } from "@/components/layout/AppShell";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";

export function AffiliateShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      homeHref="/dashboard"
      portalLabel={AFFILIATE_COPY.portal.label}
      portalBadge={AFFILIATE_COPY.portal.badge}
      variant="partner"
    >
      <main className="mx-auto max-w-7xl px-4 py-6 pb-12 sm:px-6 lg:px-8">
        {children}
      </main>
    </AppShell>
  );
}
