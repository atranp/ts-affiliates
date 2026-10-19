"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { queryKeys } from "@/lib/query-keys";

type EntryUpdate = {
  status?: string;
  amount?: number;
  description?: string | null;
};

type Adjustment = { amount: number; description: string; status: string };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Admin ledger writes for one affiliate. Each call toasts its own outcome and
 * rethrows on failure, so dialogs can stay open with the admin's input intact.
 */
export function useAdminLedgerMutations(affiliateId: string) {
  const queryClient = useQueryClient();

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.ledgerAll }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.affiliate(affiliateId),
      }),
    ]);

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EntryUpdate }) =>
      apiFetch(`/api/admin/ledger/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: invalidate,
  });

  const bulk = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
      apiFetch("/api/admin/ledger", {
        method: "PATCH",
        body: JSON.stringify({ ids, status }),
      }),
    onSuccess: invalidate,
  });

  const adjust = useMutation({
    mutationFn: (data: Adjustment) =>
      apiFetch("/api/admin/ledger", {
        method: "POST",
        body: JSON.stringify({ affiliateId, ...data }),
      }),
    onSuccess: invalidate,
  });

  return {
    saving: update.isPending || bulk.isPending || adjust.isPending,

    async updateEntry(id: string, data: EntryUpdate) {
      try {
        await update.mutateAsync({ id, data });
        toast.success("Ledger entry updated");
      } catch (err) {
        toast.error(errorMessage(err, "Update failed"));
        throw err;
      }
    },

    async bulkStatus(ids: string[], status: string) {
      try {
        await bulk.mutateAsync({ ids, status });
        toast.success(
          `Updated ${ids.length} ${ids.length === 1 ? "entry" : "entries"}`
        );
      } catch (err) {
        toast.error(errorMessage(err, "Bulk update failed"));
        throw err;
      }
    },

    async addAdjustment(data: Adjustment) {
      try {
        await adjust.mutateAsync(data);
        toast.success("Adjustment added");
      } catch (err) {
        toast.error(errorMessage(err, "Failed to add adjustment"));
        throw err;
      }
    },
  };
}
