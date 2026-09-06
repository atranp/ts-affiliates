import Link from "next/link";
import { BrandWordmark } from "@/components/layout/BrandMark";

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <main className="w-full max-w-md">
        <div className="ts-panel">
          <div className="ts-panel-header space-y-2 text-center">
            <BrandWordmark variant="eyebrow" className="justify-center" />
            <h1 className="page-title text-xl sm:text-2xl">Page not found</h1>
          </div>

          <div className="ts-panel-body space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              That link doesn&apos;t point anywhere in the ambassador portal. It
              may be out of date.
            </p>

            <Link
              href="/dashboard"
              className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:h-9 sm:text-xs"
            >
              Go to dashboard
            </Link>

            <div className="border-t border-border pt-4 text-center">
              <Link
                href="/login"
                className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
