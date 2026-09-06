"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/layout/BrandMark";

/**
 * Route-level error boundary. Without this a thrown render error drops the
 * affiliate on Next's raw error screen with no way back to the portal.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Portal render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <main className="w-full max-w-md">
        <div className="ts-panel">
          <div className="ts-panel-header space-y-2 text-center">
            <BrandWordmark variant="eyebrow" className="justify-center" />
            <h1 className="page-title text-xl sm:text-2xl">
              Something went wrong
            </h1>
          </div>

          <div className="ts-panel-body space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              This page failed to load. Your commissions and payouts are not
              affected — try again, and let us know if it keeps happening.
            </p>

            {error.digest && (
              <p className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                Reference: {error.digest}
              </p>
            )}

            <Button
              onClick={reset}
              className="h-11 w-full rounded-lg py-2.5 text-sm font-semibold shadow-sm sm:h-9 sm:text-xs"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>

            <div className="border-t border-border pt-4 text-center">
              <Link
                href="/dashboard"
                className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
