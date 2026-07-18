"use client";

import { LayoutDashboard, Settings, Users, GitBranch } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";

const navItems = [
  {
    href: "/admin",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
  },
  { href: "/admin/affiliates", label: "Affiliates", icon: Users },
  { href: "/admin/deal-rules", label: "Deal Rules", icon: GitBranch },
  { href: "/admin/settings", label: "Integrations", icon: Settings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      homeHref="/admin"
      portalLabel="Admin Console"
      portalBadge="Admin"
      navItems={navItems}
    >
      {children}
    </AppShell>
  );
}
