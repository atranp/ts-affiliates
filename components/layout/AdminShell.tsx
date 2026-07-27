"use client";

import { LayoutDashboard, Settings, Users, GitBranch, UsersRound, DollarSign } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SyncAutoStart } from "@/components/admin/SyncAutoStart";
import { SyncStatusBanner } from "@/components/admin/SyncStatusBanner";
import { useSyncStatus } from "@/hooks/use-sync-status";

const navItems = [
  {
    href: "/admin",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
  },
  { href: "/admin/affiliates", label: "Affiliates", icon: Users },
  { href: "/admin/teams", label: "Teams", icon: UsersRound },
  { href: "/admin/deal-rules", label: "Deal Rules", icon: GitBranch },
  { href: "/admin/payouts", label: "Payouts", icon: DollarSign },
  { href: "/admin/settings", label: "Integrations", icon: Settings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  useSyncStatus();

  return (
    <AppShell
      homeHref="/admin"
      portalLabel="Admin Console"
      navItems={navItems}
    >
      <SyncAutoStart />
      <div className="mb-6">
        <SyncStatusBanner />
      </div>
      {children}
    </AppShell>
  );
}
