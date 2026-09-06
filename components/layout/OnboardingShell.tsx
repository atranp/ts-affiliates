"use client";

import { useAuth } from "@/components/AuthProvider";

type OnboardingShellProps = {
  children: React.ReactNode;
};

/**
 * Minimal chrome for first-time password setup after a one-time invite link.
 * Full AffiliateShell nav is withheld until mustChangePassword is cleared.
 */
export function OnboardingShell({ children }: OnboardingShellProps) {
  const { signOut } = useAuth();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background pt-[max(0px,env(safe-area-inset-top))] pb-[max(0px,env(safe-area-inset-bottom))]">
      <header className="shrink-0 border-b border-border/60 bg-card/80 px-4 py-4 text-center backdrop-blur-sm sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">
          TRUE SCIENCES
        </p>
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">
          Ambassador Portal
        </p>
      </header>

      <main className="flex flex-1 flex-col px-4 py-6 sm:px-6 sm:py-8">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
          {children}
        </div>
      </main>

      <footer className="shrink-0 border-t border-border/40 px-4 py-4 text-center">
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Sign out
        </button>
      </footer>
    </div>
  );
}
