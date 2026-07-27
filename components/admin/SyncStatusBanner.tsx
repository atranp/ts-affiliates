"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchSyncStatus,
  startSync,
  syncStepLabel,
  type SyncStatus,
} from "@/hooks/use-sync-status";

function formatSyncTime(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function SyncStatusBanner() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const next = await fetchSyncStatus();
        if (!cancelled) setStatus(next);
      } catch {
        // ignore
      }
    }

    load();
    const id = window.setInterval(load, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  async function handleManualSync() {
    setStarting(true);
    try {
      await startSync({ auto: false });
      setStatus((prev) =>
        prev ? { ...prev, running: true, step: "affiliates" } : prev
      );
    } finally {
      setStarting(false);
    }
  }

  if (!status) return null;

  if (status.running) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary-soft/40 px-4 py-3 text-sm">
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="text-muted-foreground">
          Last sync{" "}
          <span className="font-medium text-foreground">
            {formatSyncTime(status.lastCommissionSyncAt)}
          </span>
        </p>
        {status.lastSyncError && (
          <p className="mt-1 text-destructive text-xs leading-relaxed">
            {status.lastSyncError}
          </p>
        )}
        {!status.hasSliceWP && (
          <p className="mt-1 text-warning text-xs">
            SliceWP credentials not configured — add them in Settings.
          </p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={starting || !status.hasSliceWP}
        onClick={handleManualSync}
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        Sync now
      </Button>
    </div>
  );
}
