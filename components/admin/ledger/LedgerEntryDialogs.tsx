"use client";

import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { DialogOverlay } from "@/components/admin/DialogOverlay";
import type { AdminLedgerEntry } from "@/components/admin/AdminLedgerTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LEDGER_STATUSES } from "@/lib/ledger/statuses";

export type LedgerEditForm = {
  status: string;
  amount: string;
  description: string;
};

export function LedgerEntryEditDialog({
  entry,
  form,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  entry: AdminLedgerEntry;
  form: LedgerEditForm;
  saving: boolean;
  onChange: (form: LedgerEditForm) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <DialogOverlay
      open
      label="Edit ledger entry"
      onDismiss={saving ? undefined : onClose}
    >
      <div className="ts-panel shadow-lg">
        <div className="ts-panel-header">
          <h3 className="ts-section-title">Edit ledger entry</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {entry.type} ·{" "}
            {entry.wooOrderId ? `Order #${entry.wooOrderId}` : "No order"}
          </p>
        </div>
        <div className="ts-panel-body space-y-4">
          {entry.payoutBatchId && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              Linked to payout batch &quot;{entry.payoutBatch?.label ?? entry.payoutBatchId}&quot;.
              Changing status will unlink this entry from the batch.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="edit-status" className="ts-field-label">
              Status
            </Label>
            <select
              id="edit-status"
              className="select-field w-full"
              value={form.status}
              onChange={(e) => onChange({ ...form, status: e.target.value })}
            >
              {LEDGER_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-amount" className="ts-field-label">
              Amount
            </Label>
            <Input
              id="edit-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => onChange({ ...form, amount: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description" className="ts-field-label">
              Description / notes
            </Label>
            <Input
              id="edit-description"
              value={form.description}
              onChange={(e) =>
                onChange({ ...form, description: e.target.value })
              }
              placeholder="Optional note for this entry"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-border/40 pt-4">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </DialogOverlay>
  );
}

export function LedgerBulkConfirm({
  count,
  status,
  label,
  saving,
  onConfirm,
  onCancel,
}: {
  count: number;
  status: string | null;
  label: string;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={status !== null}
      title={label || "Bulk update"}
      description={`Update ${count} selected ${count === 1 ? "entry" : "entries"}? Entries linked to payout batches will be unlinked if not marked paid.`}
      confirmLabel={label || "Confirm"}
      loading={saving}
      destructive={status === "REJECTED"}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
