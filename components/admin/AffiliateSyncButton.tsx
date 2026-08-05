"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

type AffiliateSyncResult = {
  recruitsIncluded: number;
  commissionsUpserted: number;
};

type AffiliateSyncButtonProps = {
  affiliateId: string;
  onSynced: () => Promise<void> | void;
};

export function AffiliateSyncButton({
  affiliateId,
  onSynced,
}: AffiliateSyncButtonProps) {
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await apiFetch<AffiliateSyncResult>(
        `/api/admin/affiliates/${affiliateId}/sync`,
        { method: "POST" }
      );

      toast.success(
        `Synced ${result.commissionsUpserted} commissions`,
        result.recruitsIncluded > 0
          ? {
              description: `Includes ${result.recruitsIncluded} direct ${
                result.recruitsIncluded === 1 ? "recruit" : "recruits"
              }`,
            }
          : undefined
      );

      await onSynced();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full"
      disabled={syncing}
      onClick={handleSync}
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
      {syncing ? "Syncing..." : "Sync from SliceWP"}
    </Button>
  );
}
