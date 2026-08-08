"use client";

import { Suspense } from "react";
import {
  CreditCard,
  GitBranch,
  LayoutDashboard,
  Settings,
  Users,
  UsersRound,
} from "lucide-react";
import { SidebarShell } from "@/components/layout/SidebarShell";
import { SyncAutoStart } from "@/components/admin/SyncAutoStart";
import { SyncStatusBanner } from "@/components/admin/SyncStatusBanner";
import { AdminMockBanner } from "@/components/admin/AdminMockBanner";
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
  { href: "/admin/payouts", label: "Payouts", icon: CreditCard },
  { href: "/admin/settings", label: "Integrations", icon: Settings },
];

function AdminShellContent({ children }: { children: React.ReactNode }) {
  const { status, starting, startManualSync } = useSyncStatus();

  return (
    <SidebarShell
      homeHref="/admin"
      portalLabel="Ambassador Admin Console"
      variant="admin"
      navItems={navItems}
      syncBanner={
        <>
          <AdminMockBanner />
          <SyncStatusBanner
            variant="header"
            status={status}
            starting={starting}
            onSync={startManualSync}
          />
        </>
      }
    >
      <SyncAutoStart />
      {children}
    </SidebarShell>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminShellContent>{children}</AdminShellContent>
    </Suspense>
  );
}
