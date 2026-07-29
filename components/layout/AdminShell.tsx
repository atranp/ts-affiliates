"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCard,
  GitBranch,
  LayoutDashboard,
  Settings,
  Users,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/AppShell";
import { SyncAutoStart } from "@/components/admin/SyncAutoStart";
import { SyncStatusBanner } from "@/components/admin/SyncStatusBanner";
import { useSyncStatus } from "@/hooks/use-sync-status";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/affiliates", label: "Affiliates", icon: Users },
  { href: "/admin/teams", label: "Teams", icon: UsersRound },
  { href: "/admin/deal-rules", label: "Deal Rules", icon: GitBranch },
  { href: "/admin/payouts", label: "Payouts", icon: CreditCard },
  { href: "/admin/settings", label: "Integrations", icon: Settings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status, starting, startManualSync } = useSyncStatus();

  return (
    <AppShell
      homeHref="/admin"
      portalLabel="Admin Console"
      portalBadge="Admin Ops"
      variant="admin"
      syncBanner={
        <SyncStatusBanner
          variant="header"
          status={status}
          starting={starting}
          onSync={startManualSync}
        />
      }
    >
      <SyncAutoStart />

      <div className="border-b border-brand-mid bg-brand-dark px-4 shadow-xs sm:px-6 lg:px-8">
        <nav className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href ||
                pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "ts-nav-pill whitespace-nowrap",
                  active ? "ts-nav-pill-active border border-brand-light/40" : "text-slate-300 hover:bg-[#002848] hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 pb-12 sm:px-6 lg:px-8">
        {children}
      </main>
    </AppShell>
  );
}
