"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { adminMutate, useAdminQuery } from "@/hooks/use-admin-query";
import { useLedger } from "@/hooks/use-ledger";
import type { TeamSummary } from "@/lib/teams/queries";
import { formatCurrency } from "@/lib/utils";

type RecordMode = "entries" | "lump_sum";

type EntryScope = "all" | "team" | "selected";

type RecordHistoricalPayoutDialogProps = {
  open: boolean;
  affiliateId: string;
  displayName: string;
  teams?: TeamSummary[];
  onClose: () => void;
  onRecorded?: () => void;
};

export function RecordHistoricalPayoutDialog({
  open,
  affiliateId,
  displayName,
  teams = [],
  onClose,
  onRecorded,
}: RecordHistoricalPayoutDialogProps) {
  const [mode, setMode] = useState<RecordMode>("entries");
  const [paidAt, setPaidAt] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [label, setLabel] = useState("");
  const [entryScope, setEntryScope] = useState<EntryScope>("all");
  const [teamId, setTeamId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: unpaidLedger, isLoading: unpaidLoading } = useLedger({
    affiliateId,
    status: "UNPAID",
    limit: 100,
    enabled: open && mode === "entries" && entryScope === "selected",
  });

  useEffect(() => {
    if (!open) return;
    setMode("entries");
    setPaidAt(new Date().toISOString().slice(0, 10));
    setLabel("");
    setEntryScope("all");
    setTeamId("");
    setSelectedIds(new Set());
    setAmount("");
    setDescription("");
  }, [open]);

  const previewUrl = useMemo(() => {
    if (!open || mode !== "entries") return null;

    const params = new URLSearchParams({ affiliateId });

    if (entryScope === "team") {
      if (!teamId) return null;
      params.set("teamId", teamId);
    } else if (entryScope === "selected") {
      if (selectedIds.size === 0) return null;
      params.set("entryIds", Array.from(selectedIds).join(","));
    }

    return `/api/admin/payouts/record?${params.toString()}`;
  }, [open, mode, affiliateId, entryScope, teamId, selectedIds]);

  const { data: activePreview, isLoading: previewBusy } = useAdminQuery<{
    entryCount: number;
    totalAmount: number;
  }>(
    [
      "admin",
      "historical-payout-preview",
      affiliateId,
      entryScope,
      teamId,
      Array.from(selectedIds).join(","),
    ],
    previewUrl
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (mode === "entries" && entryScope === "team" && !teamId) {
      toast.error("Select a team");
      return;
    }

    if (mode === "entries" && entryScope === "selected" && selectedIds.size === 0) {
      toast.error("Select at least one entry");
      return;
    }

    setSubmitting(true);

    try {
      const body =
        mode === "lump_sum"
          ? {
              affiliateId,
              paidAt,
              label: label.trim() || undefined,
              teamId: teamId || null,
              mode: "lump_sum" as const,
              amount: Number(amount),
              description: description.trim(),
            }
          : {
              affiliateId,
              paidAt,
              label: label.trim() || undefined,
              teamId: entryScope === "team" ? teamId || null : null,
              mode: "entries" as const,
              entryIds:
                entryScope === "selected"
                  ? Array.from(selectedIds)
                  : undefined,
            };

      const result = await adminMutate<{
        batchId: string;
        label: string;
        entriesPaid: number;
        totalAmount: number;
      }>("/api/admin/payouts/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      toast.success(`Recorded: ${result.label}`, {
        description: `${result.entriesPaid} entries · ${formatCurrency(result.totalAmount)}`,
      });
      onRecorded?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payout");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
        aria-label="Close dialog"
        onClick={() => {
          if (!submitting) onClose();
        }}
      />
      <Card className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg">
        <CardHeader>
          <CardTitle>Record historical payout</CardTitle>
          <CardDescription>
            Log a payout that was already sent to {displayName}. Creates a batch
            record and marks entries paid with the date you choose.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="record-mode"
                  checked={mode === "entries"}
                  onChange={() => setMode("entries")}
                  disabled={submitting}
                />
                From unpaid entries
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="record-mode"
                  checked={mode === "lump_sum"}
                  onChange={() => setMode("lump_sum")}
                  disabled={submitting}
                />
                Lump sum (no breakdown)
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="paid-at">Paid on</Label>
                <Input
                  id="paid-at"
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="record-label">Label (optional)</Label>
                <Input
                  id="record-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="PayPal · June 2025"
                  disabled={submitting}
                />
              </div>
            </div>

            {mode === "entries" && (
              <div className="space-y-3">
                <Label>Include</Label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="entry-scope"
                      checked={entryScope === "all"}
                      onChange={() => setEntryScope("all")}
                      disabled={submitting}
                    />
                    All unpaid
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="entry-scope"
                      checked={entryScope === "team"}
                      onChange={() => setEntryScope("team")}
                      disabled={submitting}
                    />
                    By team
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="entry-scope"
                      checked={entryScope === "selected"}
                      onChange={() => setEntryScope("selected")}
                      disabled={submitting}
                    />
                    Pick entries
                  </label>
                </div>

                {entryScope === "team" && (
                  <select
                    className="select-field w-full"
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    disabled={submitting}
                    required
                  >
                    <option value="">Select team</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                )}

                {entryScope === "selected" && (
                  <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y">
                    {unpaidLoading && (
                      <p className="p-3 text-sm text-muted-foreground">
                        Loading unpaid entries…
                      </p>
                    )}
                    {!unpaidLoading && unpaidLedger?.entries.length === 0 && (
                      <p className="p-3 text-sm text-muted-foreground">
                        No unpaid entries in first 100 results.
                      </p>
                    )}
                    {unpaidLedger?.entries.map((entry) => (
                      <label
                        key={entry.id}
                        className="flex items-start gap-3 p-3 text-sm cursor-pointer hover:bg-muted/40"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(entry.id)}
                          onChange={(e) => {
                            setSelectedIds((current) => {
                              const next = new Set(current);
                              if (e.target.checked) next.add(entry.id);
                              else next.delete(entry.id);
                              return next;
                            });
                          }}
                          disabled={submitting}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">
                            {formatCurrency(Number(entry.amount))}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            · {entry.type}
                            {entry.sourceAffiliate
                              ? ` · ${entry.sourceAffiliate.displayName ?? entry.sourceAffiliate.email}`
                              : ""}
                          </span>
                          {entry.description && (
                            <span className="block text-xs text-muted-foreground truncate">
                              {entry.description}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {(entryScope === "all" || (entryScope === "team" && teamId) || (entryScope === "selected" && selectedIds.size > 0)) && (
                  <p className="text-sm text-muted-foreground">
                    {previewBusy
                      ? "Calculating…"
                      : activePreview
                        ? `${activePreview.entryCount} entries · ${formatCurrency(activePreview.totalAmount)}`
                        : "—"}
                  </p>
                )}
              </div>
            )}

            {mode === "lump_sum" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="record-description">Description</Label>
                  <Input
                    id="record-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Manual PayPal payout before platform launch"
                    required
                    disabled={submitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="record-amount">Amount</Label>
                  <Input
                    id="record-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    disabled={submitting}
                  />
                </div>
                {teams.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="record-team">Team (optional)</Label>
                    <select
                      id="record-team"
                      className="select-field w-full"
                      value={teamId}
                      onChange={(e) => setTeamId(e.target.value)}
                      disabled={submitting}
                    >
                      <option value="">None</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Recording…" : "Record payout"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
