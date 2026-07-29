import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-4",
        className
      )}
    >
      <div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

type PartnerTabRailProps = {
  tabs: {
    id: string;
    label: string;
    icon: LucideIcon;
    suffix?: string;
  }[];
  activeTab: string;
  onTabChange: (tab: string) => void;
};

export function PartnerTabRail({
  tabs,
  activeTab,
  onTabChange,
}: PartnerTabRailProps) {
  return (
    <div className="-mx-4 border-b border-border bg-card px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="overflow-x-auto py-2">
        <div className="ts-nav-rail inline-flex min-w-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "ts-nav-pill whitespace-nowrap",
                  isActive ? "ts-nav-pill-active" : "ts-nav-pill-inactive"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {tab.label}
                {tab.suffix}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
