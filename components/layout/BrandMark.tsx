import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand bg-brand-dark text-lg font-bold tracking-wider text-white shadow-xs",
        className
      )}
    >
      TS
    </div>
  );
}
