"use client";

import { useState } from "react";
import { formatAppDate } from "@/lib/timezone";
import { cn, formatCurrency, formatSaleDate } from "@/lib/utils";
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
import { WooOrderLink } from "@/components/admin/WooOrderLink";
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
  occurredAt: string;
  payoutBatchId?: string | null;
  payoutBatch?: { id: string; label: string; status: string } | null;
  sourceAffiliate?: {
    displayName: string | null;
    email: string;
  } | null;
  dealRule?: { id: string; name: string } | null;
};


function entryDetails(entry: AdminLedgerEntry) {
  return (
    entry.description ??
    entry.sourceAffiliate?.displayName ??
    entry.sourceAffiliate?.email ??
    "—"
  );
}

function EntryTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant={type === "OVERRIDE" ? "team" : "direct"}>
      {type === "OVERRIDE" ? "Team bonus" : type}
    </Badge>
  );
}

function formatPayoutWeek(iso: string | null) {
  if (!iso) return "—";
  return formatAppDate(iso, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function entryPayoutLabel(entry: AdminLedgerEntry) {
  const batch = entry.payoutBatch;
  if (batch) return batch.label;
  return formatPayoutWeek(entry.payoutWeek) ?? "—";
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
        <p className="ts-empty-inline text-sm">No entries yet.</p>
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
              className={cn(
                "w-full sm:w-auto",
                selected.size > 0 ? undefined : "sm:ml-auto"
              )}
              onClick={onAddAdjustment}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add adjustment
            </Button>
          )}
        </div>
      )}

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="ts-table-header hover:bg-muted">
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
              <TableHead className="text-right">Sale</TableHead>
              <TableHead className="text-right">Amount</TableHead>
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
                <TableCell className="whitespace-nowrap">
                  {formatSaleDate(entry.occurredAt)}
                </TableCell>
                <TableCell>
                  <EntryTypeBadge type={entry.type} />
                </TableCell>
                <TableCell className="max-w-xs text-sm text-muted-foreground">
                  {entryDetails(entry)}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {entry.wooOrderId ? (
                    <WooOrderLink orderId={entry.wooOrderId} stopPropagation />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {entry.orderRevenue
                    ? formatCurrency(entry.orderRevenue)
                    : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-success">
                  {formatCurrency(entry.amount)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {entryPayoutLabel(entry)}
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
      </div>

      <div className="space-y-2 md:hidden">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="ts-list-row space-y-2.5 p-3.5"
          >
            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={selected.has(entry.id)}
                onChange={() => toggleOne(entry.id)}
                aria-label={`Select entry ${entry.id}`}
                className="mt-1 h-4 w-4 shrink-0 rounded border-border"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-sm text-muted-foreground">
                      {formatSaleDate(entry.occurredAt)}
                    </p>
                    <EntryTypeBadge type={entry.type} />
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="font-semibold tabular-nums text-success">
                      {formatCurrency(entry.amount)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openEdit(entry)}
                      aria-label="Edit entry"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground break-words">
                  {entryDetails(entry)}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {entry.wooOrderId && (
                    <WooOrderLink orderId={entry.wooOrderId} className="text-xs" />
                  )}
                  {entry.orderRevenue && (
                    <span>Sale {formatCurrency(entry.orderRevenue)}</span>
                  )}
                  <span>Payout {entryPayoutLabel(entry)}</span>
                </div>
              </div>
            </div>
            <select
              className="select-field w-full text-sm"
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
          </div>
        ))}
      </div>

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
          <div className="relative z-10 w-full max-w-md ts-panel shadow-lg">
            <div className="ts-panel-header">
              <h3 className="ts-section-title">Edit ledger entry</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {editing.type} ·{" "}
                {editing.wooOrderId ? `Order #${editing.wooOrderId}` : "No order"}
              </p>
            </div>
            <div className="ts-panel-body space-y-4">
              {editing.payoutBatchId && (
                <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                  Linked to payout batch &quot;{editing.payoutBatch?.label ?? editing.payoutBatchId}&quot;.
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
                <Label htmlFor="edit-amount" className="ts-field-label">
                  Amount
                </Label>
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
                <Label htmlFor="edit-description" className="ts-field-label">
                  Description / notes
                </Label>
                <Input
                  id="edit-description"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => f && { ...f, description: e.target.value })
                  }
                  placeholder="Optional note for this entry"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-border/40 pt-4">
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
