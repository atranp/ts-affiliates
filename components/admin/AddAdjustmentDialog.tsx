"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LEDGER_STATUSES } from "@/lib/ledger/statuses";

type AddAdjustmentDialogProps = {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (data: {
    amount: number;
    description: string;
    status: string;
  }) => Promise<void>;
};

export function AddAdjustmentDialog({
  open,
  loading = false,
  onClose,
  onSubmit,
}: AddAdjustmentDialogProps) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("UNPAID");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit({
      amount: Number(amount),
      description: description.trim(),
      status,
    });
    setAmount("");
    setDescription("");
    setStatus("UNPAID");
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/20 backdrop-blur-sm"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg"
      >
        <h3 className="text-lg font-semibold">Add adjustment</h3>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adj-amount">Amount</Label>
            <Input
              id="adj-amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="50.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adj-description">Description</Label>
            <Input
              id="adj-description"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Q1 performance bonus"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adj-status">Initial status</Label>
            <select
              id="adj-status"
              className="select-field w-full"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {LEDGER_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Adding..." : "Add adjustment"}
          </Button>
        </div>
      </form>
    </div>
  );
}
