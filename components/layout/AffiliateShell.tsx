"use client";

import { LayoutDashboard } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

const navItems = [
  { href: "/dashboard", label: "My Commissions", icon: LayoutDashboard },
];

export function AffiliateShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ImpersonationBanner />
      <AppShell
        homeHref="/dashboard"
        portalLabel="Affiliate Portal"
        navItems={navItems}
      >
        {children}
      </AppShell>
    </>
  );
}
