"use client";

import { useEffect, useRef } from "react";
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

const POLL_MS = 2000;

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

export function useSyncStatus(options?: { poll?: boolean }) {
  const queryClient = useQueryClient();
  const wasRunning = useRef(false);
  const poll = options?.poll ?? true;

  useEffect(() => {
    if (!poll) return;

    let cancelled = false;

    async function tick() {
      try {
        const status = await apiFetch<SyncStatus>("/api/sync");
        if (cancelled) return;

        if (wasRunning.current && !status.running) {
          if (status.lastSyncError) {
            toast.error(status.lastSyncError);
          } else if (status.lastSyncResult) {
            const r = status.lastSyncResult;
            toast.success(
              `Sync complete — ${r.affiliatesUpserted} affiliates, ${r.commissionsUpserted} commissions`
            );
          }
          await queryClient.invalidateQueries({ queryKey: ["admin"] });
          await queryClient.invalidateQueries({ queryKey: ["ledger"] });
        }

        wasRunning.current = status.running;
      } catch {
        // ignore transient poll errors
      }
    }

    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [poll, queryClient]);
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
