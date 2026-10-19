import type { ReactNode } from 'react';
import { TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/**
 * One dashboard tab: page header plus body. `fill` pins the tab to the
 * viewport on desktop so inner tables can scroll; tabs whose content is
 * taller than a laptop screen should scroll instead.
 */
export function DashboardTabPanel({
  value,
  title,
  description,
  fill = true,
  compact = false,
  children,
}: {
  value: string;
  title: ReactNode;
  description: ReactNode;
  fill?: boolean;
  /** Tighter mobile spacing for tabs that lead with a dense list. */
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <TabsContent
      value={value}
      className={cn(
        'ts-affiliate-tab-scroll flex min-h-0 min-w-0 max-w-full flex-col lg:gap-5',
        compact ? 'gap-3' : 'gap-4',
        fill && 'lg:ts-affiliate-tab-fill',
      )}
    >
      <div className={cn('ts-page-header shrink-0', compact && 'max-sm:px-0.5')}>
        <h1 className="page-title">{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {children}
    </TabsContent>
  );
}

/** Placeholder while a promotional tab's first fetch is in flight. */
export function PanelSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="h-48 animate-pulse rounded-xl border border-border/60 bg-muted/15" />
      <div className="h-48 animate-pulse rounded-xl border border-border/60 bg-muted/15" />
    </div>
  );
}
