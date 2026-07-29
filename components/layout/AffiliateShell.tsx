"use client";

import { LayoutDashboard } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
];

export function AffiliateShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ImpersonationBanner />
      <AppShell
        homeHref="/dashboard"
        portalLabel={AFFILIATE_COPY.portal.label}
        portalBadge={AFFILIATE_COPY.portal.badge}
        navItems={navItems}
      >
        {children}
      </AppShell>
    </>
  );
}
