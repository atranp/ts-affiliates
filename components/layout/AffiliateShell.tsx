"use client";

import { Suspense } from "react";
import {
  CreditCard,
  Image as ImageIcon,
  LayoutDashboard,
  Link2,
  MousePointerClick,
  Receipt,
  Settings,
  Ticket,
  Users,
} from "lucide-react";
import { SidebarShell } from "@/components/layout/SidebarShell";
import { AffiliateMockBanner } from "@/components/affiliate/AffiliateMockBanner";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";

/**
 * Ordered as the work happens: promote first, then what it earned, then the
 * account. Nine items is a lot for one flat list, so they are grouped —
 * SidebarShell renders a divider and heading between sections.
 */
const navItems = [
  {
    href: "/dashboard",
    label: AFFILIATE_COPY.tabs.home,
    icon: LayoutDashboard,
    tabId: "overview",
  },
  {
    href: "/dashboard?tab=links",
    label: AFFILIATE_COPY.tabs.links,
    icon: Link2,
    tabId: "links",
    group: "Promote",
  },
  {
    href: "/dashboard?tab=creatives",
    label: AFFILIATE_COPY.tabs.creatives,
    icon: ImageIcon,
    tabId: "creatives",
    group: "Promote",
  },
  {
    href: "/dashboard?tab=coupons",
    label: AFFILIATE_COPY.tabs.coupons,
    icon: Ticket,
    tabId: "coupons",
    group: "Promote",
  },
  {
    href: "/dashboard?tab=visits",
    label: AFFILIATE_COPY.tabs.visits,
    icon: MousePointerClick,
    tabId: "visits",
    group: "Earnings",
  },
  {
    href: "/dashboard?tab=ledger",
    label: AFFILIATE_COPY.tabs.commissions,
    icon: Receipt,
    tabId: "ledger",
    group: "Earnings",
  },
  {
    href: "/dashboard?tab=teams",
    label: AFFILIATE_COPY.tabs.team,
    icon: Users,
    tabId: "teams",
    group: "Earnings",
  },
  {
    href: "/dashboard?tab=payouts",
    label: AFFILIATE_COPY.tabs.payouts,
    icon: CreditCard,
    tabId: "payouts",
    group: "Earnings",
  },
  {
    href: "/dashboard?tab=settings",
    label: AFFILIATE_COPY.tabs.settings,
    icon: Settings,
    tabId: "settings",
    group: "Account",
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
