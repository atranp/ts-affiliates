"use client";

import { Suspense } from "react";
import {
  CreditCard,
  LayoutDashboard,
  Receipt,
  Users,
} from "lucide-react";
import { SidebarShell } from "@/components/layout/SidebarShell";
import { AffiliateMockBanner } from "@/components/affiliate/AffiliateMockBanner";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";

const navItems = [
  {
    href: "/dashboard",
    label: AFFILIATE_COPY.tabs.home,
    icon: LayoutDashboard,
    tabId: "overview",
  },
  {
    href: "/dashboard?tab=ledger",
    label: AFFILIATE_COPY.tabs.commissions,
    icon: Receipt,
    tabId: "ledger",
  },
  {
    href: "/dashboard?tab=teams",
    label: AFFILIATE_COPY.tabs.team,
    icon: Users,
    tabId: "teams",
  },
  {
    href: "/dashboard?tab=payouts",
    label: AFFILIATE_COPY.tabs.payouts,
    icon: CreditCard,
    tabId: "payouts",
  },
];

function AffiliateShellContent({ children }: { children: React.ReactNode }) {
  return (
    <SidebarShell
      homeHref="/dashboard"
      portalLabel="Ambassador Portal"
      variant="partner"
      navItems={navItems}
      syncBanner={<AffiliateMockBanner />}
    >
      {children}
    </SidebarShell>
  );
}

export function AffiliateShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AffiliateShellContent>{children}</AffiliateShellContent>
    </Suspense>
  );
}
