"use client";

import type { FormEvent, ReactNode } from "react";
import { DialogOverlay } from "@/components/admin/DialogOverlay";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type DealRuleDialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  submitLabel: string;
  submitting: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
};

export function DealRuleDialog({
  open,
  title,
  description,
  submitLabel,
  submitting,
  onSubmit,
  onClose,
  children,
}: DealRuleDialogProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <DialogOverlay
      open={open}
      label={title}
      onDismiss={submitting ? undefined : onClose}
      className="max-w-2xl"
    >
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            {children}
            <div className="mt-2 flex justify-end gap-2 md:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : submitLabel}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </DialogOverlay>
  );
}
