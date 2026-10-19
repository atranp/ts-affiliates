"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type SortDirection = "asc" | "desc";

/** Column header that toggles sort; the chevron only shows on the active column. */
export function SortableHead<K extends string>({
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
  className,
  buttonClassName,
  children,
}: {
  sortKey: K;
  activeKey: K;
  direction: SortDirection;
  onSort: (key: K) => void;
  align?: "left" | "right";
  className?: string;
  buttonClassName?: string;
  children: ReactNode;
}) {
  const active = activeKey === sortKey;

  return (
    <TableHead
      className={cn(className, align === "right" && "text-right")}
      aria-sort={
        active
          ? direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-brand-dark",
          buttonClassName,
          align === "right" && "flex-row-reverse",
          active ? "text-brand-dark" : "text-muted-foreground"
        )}
      >
        {children}
        {active &&
          (direction === "asc" ? (
            <ChevronUp className="h-3 w-3 text-primary" />
          ) : (
            <ChevronDown className="h-3 w-3 text-primary" />
          ))}
      </button>
    </TableHead>
  );
}
