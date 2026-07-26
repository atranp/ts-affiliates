"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { LEDGER_STATUSES } from "@/lib/ledger/statuses";
import { Pencil, Plus } from "lucide-react";

export type AdminLedgerEntry = {
  id: string;
  type: string;
  amount: string | number;
  status: string;
  description: string | null;
  wooOrderId: number | null;
  orderRevenue: string | number | null;
  payoutWeek: string | null;
  paidAt: string | null;
  createdAt: string;
  payoutBatchId?: string | null;
  payoutBatch?: { id: string; label: string } | null;
  sourceAffiliate?: {
    displayName: string | null;
    email: string;
  } | null;
  dealRule?: { id: string; name: string } | null;
};


function formatPayoutWeek(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

type EditForm = {
  status: string;
  amount: string;
  description: string;
};

type AdminLedgerTableProps = {
  entries: AdminLedgerEntry[];
  loading?: boolean;
  onUpdateEntry: (
    id: string,
    data: { status?: string; amount?: number; description?: string | null }
  ) => Promise<void>;
  onBulkStatus: (ids: string[], status: string) => Promise<void>;
  onAddAdjustment?: () => void;
};

export function AdminLedgerTable({
  entries,
  loading = false,
  onUpdateEntry,
  onBulkStatus,
  onAddAdjustment,
}: AdminLedgerTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<AdminLedgerEntry | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<{
    status: string;
    label: string;
  } | null>(null);

  const allSelected =
    entries.length > 0 && entries.every((e) => selected.has(e.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openEdit(entry: AdminLedgerEntry) {
    setEditing(entry);
    setForm({
      status: entry.status,
      amount: String(entry.amount),
      description: entry.description ?? "",
    });
  }

  async function saveEdit() {
    if (!editing || !form) return;
    setSaving(true);
    try {
      await onUpdateEntry(editing.id, {
        status: form.status,
        amount: Number(form.amount),
        description: form.description.trim() || null,
      });
      setEditing(null);
      setForm(null);
    } finally {
      setSaving(false);
    }
  }

  async function quickStatusChange(entry: AdminLedgerEntry, status: string) {
    if (status === entry.status) return;
    setSaving(true);
    try {
      await onUpdateEntry(entry.id, { status });
    } finally {
      setSaving(false);
    }
  }

  async function runBulk() {
    if (!bulkConfirm) return;
    setSaving(true);
    try {
      await onBulkStatus(Array.from(selected), bulkConfirm.status);
      setSelected(new Set());
      setBulkConfirm(null);
    } finally {
      setSaving(false);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="space-y-3">
        {onAddAdjustment && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={onAddAdjustment}>
              <Plus className="mr-2 h-4 w-4" />
              Add adjustment
            </Button>
          </div>
        )}
        <p className="text-sm text-muted-foreground">No entries yet.</p>
      </div>
    );
  }

  return (
    <>
      {(selected.size > 0 || onAddAdjustment) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selected.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || saving}
                onClick={() =>
                  setBulkConfirm({ status: "UNPAID", label: "Mark unpaid" })
                }
              >
                Mark unpaid
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || saving}
                onClick={() =>
                  setBulkConfirm({ status: "PAID", label: "Mark paid" })
                }
              >
                Mark paid
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || saving}
                onClick={() =>
                  setBulkConfirm({ status: "REJECTED", label: "Reject" })
                }
              >
                Reject
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          )}
          {onAddAdjustment && (
            <Button
              variant="outline"
              size="sm"
              className={selected.size > 0 ? undefined : "ml-auto"}
              onClick={onAddAdjustment}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add adjustment
            </Button>
          )}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Select all entries"
                className="h-4 w-4 rounded border-border"
              />
            </TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Details</TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Sale</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Payout</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>
                <input
                  type="checkbox"
                  checked={selected.has(entry.id)}
                  onChange={() => toggleOne(entry.id)}
                  aria-label={`Select entry ${entry.id}`}
                  className="h-4 w-4 rounded border-border"
                />
              </TableCell>
              <TableCell>
                {new Date(entry.createdAt).toLocaleDateString("en-US")}
              </TableCell>
              <TableCell>
                <Badge
                  variant={entry.type === "OVERRIDE" ? "unpaid" : "secondary"}
                >
                  {entry.type === "OVERRIDE" ? "Team bonus" : entry.type}
                </Badge>
              </TableCell>
              <TableCell className="max-w-xs text-sm text-muted-foreground">
                {entry.description ??
                  entry.sourceAffiliate?.displayName ??
                  entry.sourceAffiliate?.email ??
                  "—"}
              </TableCell>
              <TableCell>
                {entry.wooOrderId ? `#${entry.wooOrderId}` : "—"}
              </TableCell>
              <TableCell>
                {entry.orderRevenue
                  ? formatCurrency(entry.orderRevenue)
                  : "—"}
              </TableCell>
              <TableCell className="font-medium text-success">
                {formatCurrency(entry.amount)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {entry.payoutBatch?.label ??
                  formatPayoutWeek(entry.payoutWeek) ??
                  "—"}
              </TableCell>
              <TableCell>
                <select
                  className="select-field min-w-[7rem] text-xs"
                  value={entry.status}
                  disabled={loading || saving}
                  onChange={(e) => quickStatusChange(entry, e.target.value)}
                >
                  {LEDGER_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => openEdit(entry)}
                  aria-label="Edit entry"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editing && form && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
            aria-label="Close dialog"
            onClick={() => {
              setEditing(null);
              setForm(null);
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Edit ledger entry</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {editing.type} ·{" "}
              {editing.wooOrderId ? `Order #${editing.wooOrderId}` : "No order"}
            </p>
            {editing.payoutBatchId && (
              <p className="mt-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                Linked to payout batch &quot;{editing.payoutBatch?.label ?? editing.payoutBatchId}&quot;.
                Changing status will unlink this entry from the batch.
              </p>
            )}
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <select
                  id="edit-status"
                  className="select-field w-full"
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => f && { ...f, status: e.target.value })
                  }
                >
                  {LEDGER_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-amount">Amount</Label>
                <Input
                  id="edit-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => f && { ...f, amount: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description / notes</Label>
                <Input
                  id="edit-description"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => f && { ...f, description: e.target.value })
                  }
                  placeholder="Optional note for this entry"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setForm(null);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={saveEdit} disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!bulkConfirm}
        title={bulkConfirm?.label ?? "Bulk update"}
        description={`Update ${selected.size} selected ${selected.size === 1 ? "entry" : "entries"}? Entries linked to payout batches will be unlinked if not marked paid.`}
        confirmLabel={bulkConfirm?.label ?? "Confirm"}
        loading={saving}
        destructive={bulkConfirm?.status === "REJECTED"}
        onConfirm={runBulk}
        onCancel={() => setBulkConfirm(null)}
      />
    </>
  );
}
