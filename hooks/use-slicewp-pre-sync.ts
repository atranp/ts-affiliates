"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

/**
 * Pulls one affiliate from SliceWP before their payout options load, so
 * anything already paid there is excluded. Runs once per affiliate selection;
 * `refreshedAt` changes after every attempt and belongs in dependent query keys.
 */
export function useSliceWPPreSync(affiliateId: string | null) {
  const [refreshedAt, setRefreshedAt] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [syncedAffiliateId, setSyncedAffiliateId] = useState<string | null>(
    null
  );

  const runSync = useCallback(async (id: string) => {
    setSyncing(true);
    setSyncFailed(false);
    try {
      await apiFetch(`/api/admin/affiliates/${id}/sync`, { method: "POST" });
      setSyncedAt(Date.now());
    } catch {
      setSyncFailed(true);
    } finally {
      setSyncedAffiliateId(id);
      setSyncing(false);
      setRefreshedAt(Date.now());
    }
  }, []);

  const syncStartedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!affiliateId) {
      syncStartedFor.current = null;
      setSyncedAffiliateId(null);
      setSyncedAt(null);
      setSyncFailed(false);
      return;
    }
    if (syncStartedFor.current === affiliateId) return;
    syncStartedFor.current = affiliateId;
    void runSync(affiliateId);
  }, [affiliateId, runSync]);

  /** Re-reads SliceWP when an affiliate is chosen; otherwise just refetches. */
  function refresh() {
    if (affiliateId) {
      void runSync(affiliateId);
      return;
    }
    setRefreshedAt(Date.now());
  }

  return {
    synced: !!affiliateId && syncedAffiliateId === affiliateId,
    syncing,
    syncedAt,
    syncFailed,
    refreshedAt,
    refresh,
  };
}
