"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { KeyRound, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

export type SidebarNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Partner tabs — used when href alone is not enough for active state */
  tabId?: string;
};

export type SidebarShellVariant = "partner" | "admin";

type SidebarShellProps = {
  homeHref: string;
  portalLabel?: string;
  variant?: SidebarShellVariant;
  navItems: SidebarNavItem[];
  syncBanner?: React.ReactNode;
  children: React.ReactNode;
};

function partnerTabActive(
  tabId: string,
  pathname: string,
  tabParam: string | null
) {
  if (tabId === "overview") {
    if (pathname !== "/dashboard") return false;
    return (
      !tabParam ||
      tabParam === "overview" ||
      tabParam === "home"
    );
  }
  if (tabId === "payouts") {
    return tabParam === "payouts" || pathname.startsWith("/dashboard/payouts");
  }
  if (tabId === "ledger") {
    return tabParam === "ledger" || tabParam === "commissions";
  }
  return tabParam === tabId;
}

function adminNavActive(
  item: SidebarNavItem,
  pathname: string
) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function SidebarNavLink({
  item,
  active,
  onNavigate,
}: {
  item: SidebarNavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function SidebarPanel({
  homeHref,
  portalLabel,
  variant,
  navItems,
  navActive,
  onNavigate,
}: {
  homeHref: string;
  portalLabel?: string;
  variant: SidebarShellVariant;
  navItems: SidebarNavItem[];
  navActive: (item: SidebarNavItem) => boolean;
  onNavigate?: () => void;
}) {
  const { user, signOut } = useAuth();

  const initials =
    user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "?";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-5">
        <Link href={homeHref} onClick={onNavigate} className="block min-w-0">
          <p className="truncate text-base font-bold tracking-tight text-brand-dark">
            TRUE SCIENCES
          </p>
          {portalLabel && (
            <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
              {portalLabel}
            </p>
          )}
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => (
          <SidebarNavLink
            key={item.href}
            item={item}
            active={navActive(item)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 flex items-center gap-2.5 px-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-mid bg-primary text-xs font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">
              {user?.name}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {user?.email}
            </p>
          </div>
        </div>
        {variant === "partner" && (
          <Link
            href="/account/change-password"
            onClick={onNavigate}
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Change Password
          </Link>
        )}
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            signOut();
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/5"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

export function SidebarShell({
  homeHref,
  portalLabel,
  variant = "partner",
  navItems,
  syncBanner,
  children,
}: SidebarShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, searchParams]);

  const tabParam = searchParams.get("tab");

  function navActive(item: SidebarNavItem) {
    if (variant === "partner" && item.tabId) {
      return partnerTabActive(item.tabId, pathname, tabParam);
    }
    return adminNavActive(item, pathname);
  }

  const sidebarProps = {
    homeHref,
    portalLabel,
    variant,
    navItems,
    navActive,
    onNavigate: () => setMobileOpen(false),
  };

  return (
    <div className="min-h-screen bg-background">
      <ImpersonationBanner />

      <div className="flex min-h-[calc(100vh-var(--impersonation-offset,0px))]">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-border bg-card lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:flex-col">
          <SidebarPanel {...sidebarProps} />
        </aside>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur-md lg:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-brand-dark hover:bg-muted"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-brand-dark">
                TRUE SCIENCES
              </p>
              {portalLabel && (
                <p className="truncate text-[11px] text-muted-foreground">
                  {portalLabel}
                </p>
              )}
            </div>
          </header>

          {variant === "admin" && syncBanner}

          <main className="flex-1 px-4 py-6 pb-12 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(100%,16rem)] flex-col border-r border-border bg-card shadow-xl">
            <div className="flex justify-end border-b border-border p-2">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <SidebarPanel {...sidebarProps} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
