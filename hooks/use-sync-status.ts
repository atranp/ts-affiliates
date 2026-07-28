"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import type { SyncResult } from "@/lib/admin/types";

export type SyncStatus = {
  running: boolean;
  step: "affiliates" | "profiles" | "commissions" | null;
  startedAt: string | null;
  lastAffiliateSyncAt: string | null;
  lastCommissionSyncAt: string | null;
  lastSyncError: string | null;
  lastSyncResult: SyncResult | null;
  hasWooCommerce: boolean;
  hasSliceWP: boolean;
};

const POLL_RUNNING_MS = 4000;
const POLL_IDLE_MS = 30000;

export function syncStepLabel(step: SyncStatus["step"]) {
  switch (step) {
    case "affiliates":
      return "Syncing affiliates…";
    case "profiles":
      return "Linking portal accounts…";
    case "commissions":
      return "Syncing commissions & deal rules…";
    default:
      return "Syncing…";
  }
}

export async function startSync(options?: { auto?: boolean }) {
  return apiFetch<{ status: string }>("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auto: options?.auto ?? false }),
  });
}

export async function fetchSyncStatus() {
  return apiFetch<SyncStatus>("/api/sync");
}

export function useSyncStatus(options?: { poll?: boolean }) {
  const queryClient = useQueryClient();
  const wasRunning = useRef(false);
  const poll = options?.poll ?? true;
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(async () => {
    const next = await fetchSyncStatus();
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    if (!poll) return;

    let cancelled = false;
    let timeoutId: number;

    async function tick() {
      try {
        const next = await fetchSyncStatus();
        if (cancelled) return;

        setStatus(next);

        if (wasRunning.current && !next.running) {
          if (next.lastSyncError) {
            toast.error(next.lastSyncError);
          } else if (next.lastSyncResult) {
            const r = next.lastSyncResult;
            toast.success(
              `Sync complete — ${r.affiliatesUpserted} affiliates, ${r.commissionsUpserted} commissions`
            );
          }
          await queryClient.invalidateQueries({ queryKey: ["admin"] });
          await queryClient.invalidateQueries({ queryKey: ["ledger"] });
        }

        wasRunning.current = next.running;
        const delay = next.running ? POLL_RUNNING_MS : POLL_IDLE_MS;
        timeoutId = window.setTimeout(tick, delay);
      } catch {
        if (!cancelled) {
          timeoutId = window.setTimeout(tick, POLL_IDLE_MS);
        }
      }
    }

    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [poll, queryClient]);

  const startManualSync = useCallback(async () => {
    setStarting(true);
    try {
      await startSync({ auto: false });
      setStatus((prev) =>
        prev ? { ...prev, running: true, step: "affiliates" } : prev
      );
      wasRunning.current = true;
    } finally {
      setStarting(false);
    }
  }, []);

  return { status, starting, refresh, startManualSync };
}
