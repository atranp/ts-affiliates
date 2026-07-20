"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/AuthProvider";

export type ShellNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match only exact path (for /admin vs /admin/settings) */
  exact?: boolean;
};

type AppShellProps = {
  homeHref: string;
  portalLabel: string;
  portalBadge?: string;
  navItems: ShellNavItem[];
  children: React.ReactNode;
};

export function AppShell({
  homeHref,
  portalLabel,
  portalBadge,
  navItems,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const navLinkClass = (item: ShellNavItem) => {
    const active = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

    return cn(
      "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors",
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    );
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 shadow-sm backdrop-blur">
        <div className="mx-auto max-w-7xl px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex items-center justify-between gap-3">
            <Link href={homeHref} className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-base font-semibold text-brand-dark sm:text-lg">
                  True Sciences
                </p>
                {portalBadge && (
                  <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary sm:inline">
                    {portalBadge}
                  </span>
                )}
              </div>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {portalLabel}
              </p>
            </Link>

            <div className="hidden items-center gap-3 sm:flex">
              <span className="max-w-[180px] truncate text-sm text-muted-foreground">
                {user?.name}
              </span>
              <Button variant="ghost" size="sm" onClick={signOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 sm:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>

          <nav className="mt-3 hidden flex-wrap gap-1 sm:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navLinkClass(item)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {menuOpen && (
            <div className="mt-3 border-t border-border pt-3 sm:hidden">
              <nav className="flex flex-col gap-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={navLinkClass(item)}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="truncate text-sm text-muted-foreground">
                  {user?.name}
                </span>
                <Button variant="ghost" size="sm" onClick={signOut}>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-53px)] max-w-7xl overflow-x-hidden px-3 py-4 sm:min-h-[calc(100vh-65px)] sm:px-4 sm:py-6">
        {children}
      </main>
    </>
  );
}
