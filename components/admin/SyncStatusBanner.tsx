"use client";

import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  syncStepLabel,
  type SyncStatus,
} from "@/hooks/use-sync-status";
import { describeSyncError } from "@/lib/sync-errors";

function formatSyncTime(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type SyncStatusBannerProps = {
  status: SyncStatus | null;
  starting: boolean;
  onSync: () => void;
  variant?: "header" | "card";
};

export function SyncStatusBanner({
  status,
  starting,
  onSync,
  variant = "card",
}: SyncStatusBannerProps) {
  if (!status) return null;

  const syncError = describeSyncError(status.lastSyncError);

  if (variant === "header") {
    if (status.running) {
      return (
        <div className="flex items-center gap-3 border-b border-primary/20 bg-primary/5 px-4 py-2 text-xs">
          <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
          <div className="min-w-0">
            <span className="font-semibold text-foreground">
              {syncStepLabel(status.step)}
            </span>
            <span className="ml-2 text-muted-foreground">
              Running in the background
            </span>
          </div>
        </div>
      );
    }

    const connected = status.hasWooCommerce && status.hasSliceWP;

    return (
      <div className="flex flex-wrap items-center justify-between gap-x-2 border-b border-border bg-muted px-4 py-0.5 text-xs text-muted-foreground sm:py-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {connected ? (
            <div className="flex items-center gap-1.5 font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>WooCommerce + SliceWP Engine Active</span>
            </div>
          ) : (
            <span className="font-medium text-warning">
              Integrations not fully configured
            </span>
          )}
          <span className="hidden text-slate-300 sm:inline">•</span>
          <span className="hidden sm:inline">
            Last Data Sync:{" "}
            <strong className="text-foreground">
              {formatSyncTime(status.lastCommissionSyncAt)}
            </strong>
          </span>
          {syncError && (
            <span
              className="flex items-center gap-1.5 font-medium text-destructive"
              title={syncError.detail ?? undefined}
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {syncError.message}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onSync}
          disabled={starting || !status.hasSliceWP}
          className="-mr-2 flex min-h-9 items-center gap-1.5 px-2 font-semibold text-primary hover:text-brand-mid hover:underline disabled:opacity-50 sm:mr-0 sm:min-h-0 sm:px-0"
        >
          <RefreshCw
            className={`h-3 w-3 ${starting ? "animate-spin" : ""}`}
          />
          {starting ? "Syncing Sales Ledger..." : "Sync now"}
        </button>
      </div>
    );
  }

  if (status.running) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-primary" />
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            {syncStepLabel(status.step)}
          </p>
          <p className="text-xs text-muted-foreground">
            Running in the background — you can keep working
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-xs">
      <div className="min-w-0">
        <p className="text-muted-foreground">
          Last sync{" "}
          <span className="font-medium text-foreground">
            {formatSyncTime(status.lastCommissionSyncAt)}
          </span>
        </p>
        {syncError && (
          <p
            className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-destructive"
            title={syncError.detail ?? undefined}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {syncError.message}
          </p>
        )}
        {!status.hasSliceWP && (
          <p className="mt-1 text-xs text-warning">
            SliceWP credentials not configured — add them in Settings.
          </p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={starting || !status.hasSliceWP}
        onClick={onSync}
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Sync now
      </Button>
    </div>
  );
}
