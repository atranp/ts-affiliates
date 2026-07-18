"use client";

import { LayoutDashboard } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

const navItems = [
  { href: "/dashboard", label: "My Commissions", icon: LayoutDashboard },
];

export function AffiliateShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      homeHref="/dashboard"
      portalLabel="Affiliate Portal"
      navItems={navItems}
    >
      {children}
    </AppShell>
  );
}
