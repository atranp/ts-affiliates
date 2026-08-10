import { cn } from "@/lib/utils";

function Block({ className }: { className?: string }) {
  return <div className={`rounded-md bg-muted ${className ?? ""}`} />;
}

function HomeCardSkeleton({
  tall = false,
  className,
}: {
  tall?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('ts-home-card overflow-hidden', className)}>
      <div className="ts-home-card-header space-y-2">
        <Block className="h-4 w-36" />
        <Block className="h-3 w-52 max-w-full" />
      </div>
      <div className="ts-home-card-body space-y-3">
        <Block className="h-3 w-40" />
        <Block className={tall ? "h-40 w-full rounded-xl" : "h-28 w-full rounded-xl"} />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="ts-home-overview animate-pulse">
      <div className="space-y-2">
        <Block className="h-7 w-56 max-w-full sm:h-8" />
        <Block className="h-4 w-80 max-w-full" />
      </div>

      <div className="ts-home-stat-grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ts-stat-card ts-stat-card-compact">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-2.5">
                <Block className="h-3 w-24" />
                <Block className="h-8 w-32" />
              </div>
              <Block className="h-4 w-4 rounded-sm" />
            </div>
          </div>
        ))}
      </div>

      <div className="ts-home-split">
        <HomeCardSkeleton />
        <HomeCardSkeleton />
      </div>

      <HomeCardSkeleton tall className="ts-home-teams" />
    </div>
  );
}

export function TeamsPanelSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 animate-pulse flex-col gap-5">
      <div className="grid shrink-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ts-stat-card h-[6.5rem]" />
        ))}
      </div>
      <div className="min-h-[16rem] flex-1 rounded-xl border border-border bg-muted/20" />
    </div>
  );
}

export function PayoutDetailSkeleton() {
  return (
    <div className="max-w-5xl animate-pulse space-y-6">
      <Block className="h-4 w-32" />
      <div className="space-y-2">
        <Block className="h-8 w-48" />
        <Block className="h-4 w-64 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ts-stat-card h-24" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-border bg-muted/20" />
    </div>
  );
}

export function InlinePanelSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl border border-border/45 bg-muted/10 ${className ?? "h-28"}`}
    />
  );
}
