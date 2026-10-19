"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";
import type { SyncResult } from "@/lib/admin/types";

export type SyncStatus = {
  running: boolean;
  step: "affiliates" | "profiles" | "commissions" | "payouts" | null;
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
    case "payouts":
      return "Importing SliceWP payouts…";
    default:
      return "Syncing…";
  }
}

export async function startSync(options?: { auto?: boolean }) {
  return apiFetch<{ status: string }>("/api/sync", {
    method: "POST",
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
  const [starting, setStarting] = useState(false);

  const { data: status } = useQuery({
    queryKey: queryKeys.admin.syncStatus,
    queryFn: fetchSyncStatus,
    enabled: poll,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.running ? POLL_RUNNING_MS : POLL_IDLE_MS,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!status) return;

    if (wasRunning.current && !status.running) {
      if (status.lastSyncError) {
        toast.error(status.lastSyncError);
      } else if (status.lastSyncResult) {
        const r = status.lastSyncResult;
        const parts = [
          `${r.affiliatesUpserted} affiliates`,
          `${r.commissionsUpserted} commissions`,
          r.slicewpPayoutsSynced
            ? `${r.slicewpPayoutsSynced} SliceWP payouts`
            : null,
        ].filter(Boolean);
        toast.success(`Sync complete — ${parts.join(", ")}`);
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ledgerAll });
    }

    wasRunning.current = status.running;
  }, [status, queryClient]);

  const startManualSync = useCallback(async () => {
    setStarting(true);
    try {
      await startSync({ auto: false });
      queryClient.setQueryData<SyncStatus>(queryKeys.admin.syncStatus, (prev) =>
        prev ? { ...prev, running: true, step: "affiliates" } : prev
      );
      wasRunning.current = true;
    } finally {
      setStarting(false);
    }
  }, [queryClient]);

  return { status: status ?? null, starting, startManualSync };
}
