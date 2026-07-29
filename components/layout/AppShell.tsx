"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { BrandMark } from "@/components/layout/BrandMark";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

export type AppShellVariant = "partner" | "admin";

type AppShellProps = {
  homeHref: string;
  portalLabel: string;
  portalBadge?: string;
  variant?: AppShellVariant;
  syncBanner?: React.ReactNode;
  children: React.ReactNode;
};

export function AppShell({
  homeHref,
  portalLabel,
  portalBadge,
  variant = "partner",
  syncBanner,
  children,
}: AppShellProps) {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [homeHref]);

  const initials =
    user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "?";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 shadow-xs backdrop-blur-md">
        <ImpersonationBanner />

        {variant === "admin" && syncBanner}

        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link href={homeHref} className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-base font-bold leading-none tracking-tight text-brand-dark sm:text-lg">
                    TRUE SCIENCES
                  </span>
                  {portalBadge && (
                    <span className="hidden rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary sm:inline">
                      {portalBadge}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="truncate text-xs font-medium text-muted-foreground">
                    {portalLabel}
                  </span>
                  <span className="hidden text-slate-300 md:inline">•</span>
                  <span className="hidden text-[11px] font-medium italic text-brand md:inline">
                    Premium Research · Simple Pricing
                  </span>
                </div>
              </div>
            </div>
          </Link>

          <div className="hidden items-center gap-3 md:flex">
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                className="flex items-center gap-2 rounded-lg border border-transparent p-1.5 text-left transition-colors hover:border-border hover:bg-muted"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-mid bg-primary text-xs font-semibold text-white">
                  {initials}
                </div>
                <div className="max-w-[160px] text-xs">
                  <div className="truncate font-semibold text-foreground">
                    {user?.name}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {user?.email}
                  </div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>

              {profileOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40"
                    aria-label="Close menu"
                    onClick={() => setProfileOpen(false)}
                  />
                  <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-border bg-card py-2 text-xs shadow-lg">
                    <div className="border-b border-border bg-muted px-3 py-2">
                      <div className="font-semibold text-brand-dark">
                        {user?.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {user?.email}
                      </div>
                    </div>
                    <div className="border-t border-border pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          signOut();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 font-medium text-destructive hover:bg-destructive/5"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            className="shrink-0 rounded-lg p-2 text-brand-dark hover:bg-muted md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-border px-4 py-3 md:hidden">
            <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
              <span className="text-muted-foreground">Signed in as</span>
              <span className="truncate font-semibold text-brand-dark">
                {user?.name}
              </span>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 py-2 text-xs font-semibold text-red-600"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        )}
      </header>

      {children}
    </div>
  );
}
