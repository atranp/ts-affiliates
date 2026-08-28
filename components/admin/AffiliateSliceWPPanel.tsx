"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Pencil, Slash, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { adminMutate } from "@/hooks/use-admin-query";

/**
 * Edits that are written straight through to SliceWP. Kept separate from the
 * portal panel because these change the commission engine's own records, while
 * portal actions only touch Supabase auth.
 */

type AffiliateSliceWPPanelProps = {
  affiliateId: string;
  slicewpId: number;
  status: string;
  paymentEmail: string | null;
  commissionRate: string | null;
  parentSlicewpId: number | null;
  onUpdated: () => Promise<void>;
};

type EditPayload = {
  status?: string;
  paymentEmail?: string;
  commissionRate?: number | null;
  parentSlicewpId?: number | null;
};

function statusVariant(
  status: string
): "paid" | "pending" | "secondary" | "destructive" {
  switch (status) {
    case "ACTIVE":
      return "paid";
    case "PENDING":
      return "pending";
    case "REJECTED":
      return "destructive";
    default:
      return "secondary";
  }
}

export function AffiliateSliceWPPanel({
  affiliateId,
  slicewpId,
  status,
  paymentEmail,
  commissionRate,
  parentSlicewpId,
  onUpdated,
}: AffiliateSliceWPPanelProps) {
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const [emailDraft, setEmailDraft] = useState(paymentEmail ?? "");
  const [rateDraft, setRateDraft] = useState(commissionRate ?? "");
  const [sponsorDraft, setSponsorDraft] = useState(
    parentSlicewpId ? String(parentSlicewpId) : ""
  );

  async function write(label: string, payload: EditPayload) {
    setSaving(label);
    try {
      const result = await adminMutate<{ mirrored: boolean }>(
        `/api/admin/affiliates/${affiliateId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      await onUpdated();

      if (result.mirrored) {
        toast.success("Saved to SliceWP");
      } else {
        toast.success("Saved to SliceWP", {
          description:
            "This database mirrors a different store, so the values shown here are unchanged.",
        });
      }
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
      return false;
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveFields() {
    const payload: EditPayload = {};

    if (emailDraft.trim() !== (paymentEmail ?? "")) {
      payload.paymentEmail = emailDraft.trim();
    }

    const rate = rateDraft.trim();
    if (rate !== (commissionRate ?? "")) {
      payload.commissionRate = rate === "" ? null : Number(rate);
    }

    const sponsor = sponsorDraft.trim();
    const currentSponsor = parentSlicewpId ? String(parentSlicewpId) : "";
    if (sponsor !== currentSponsor) {
      payload.parentSlicewpId = sponsor === "" ? null : Number(sponsor);
    }

    if (Object.keys(payload).length === 0) {
      setEditing(false);
      return;
    }

    if (await write("fields", payload)) {
      setEditing(false);
    }
  }

  function cancelEdit() {
    setEmailDraft(paymentEmail ?? "");
    setRateDraft(commissionRate ?? "");
    setSponsorDraft(parentSlicewpId ? String(parentSlicewpId) : "");
    setEditing(false);
  }

  const busy = saving !== null;

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">SliceWP record</CardTitle>
          <Badge variant={statusVariant(status)}>{status}</Badge>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sw-payment-email">Payment email</Label>
                <Input
                  id="sw-payment-email"
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  placeholder="payouts@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sw-rate">Commission rate (%)</Label>
                <Input
                  id="sw-rate"
                  inputMode="decimal"
                  value={rateDraft}
                  onChange={(e) => setRateDraft(e.target.value)}
                  placeholder="Blank uses the site default"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sw-sponsor">Sponsor (SliceWP ID)</Label>
                <Input
                  id="sw-sponsor"
                  inputMode="numeric"
                  value={sponsorDraft}
                  onChange={(e) => setSponsorDraft(e.target.value)}
                  placeholder="Blank removes the sponsor"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleSaveFields} disabled={busy}>
                  {saving === "fields" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cancelEdit}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground">Payment email</span>
                <span className="font-medium break-all">
                  {paymentEmail ?? "—"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Commission rate</span>
                <span className="font-medium">
                  {commissionRate ? `${commissionRate}%` : "Site default"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Sponsor</span>
                <span className="font-medium">
                  {parentSlicewpId ? `#${parentSlicewpId}` : "None"}
                </span>
              </div>
              <div className="flex justify-between gap-4 border-t pt-3">
                <span className="text-muted-foreground">SliceWP ID</span>
                <span className="font-medium">#{slicewpId}</span>
              </div>

              <div className="grid gap-2 pt-1 sm:grid-cols-2 lg:grid-cols-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(true)}
                  disabled={busy}
                >
                  <Pencil className="h-4 w-4" />
                  Edit details
                </Button>

                {status !== "ACTIVE" && (
                  <Button
                    size="sm"
                    onClick={() => write("approve", { status: "ACTIVE" })}
                    disabled={busy}
                  >
                    {saving === "approve" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Approve
                  </Button>
                )}

                {status !== "REJECTED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRejectOpen(true)}
                    disabled={busy}
                  >
                    <X className="h-4 w-4" />
                    Reject
                  </Button>
                )}

                {status === "ACTIVE" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => write("deactivate", { status: "INACTIVE" })}
                    disabled={busy}
                  >
                    {saving === "deactivate" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Slash className="h-4 w-4" />
                    )}
                    Deactivate
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={rejectOpen}
        title="Reject this affiliate?"
        description="They stop earning commissions on new orders. Commissions already recorded are unaffected. This writes to SliceWP immediately."
        confirmLabel="Reject"
        destructive
        loading={saving === "reject"}
        onConfirm={async () => {
          if (await write("reject", { status: "REJECTED" })) {
            setRejectOpen(false);
          }
        }}
        onCancel={() => setRejectOpen(false)}
      />
    </>
  );
}
