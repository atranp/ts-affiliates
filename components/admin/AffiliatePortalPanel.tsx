"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Eye,
  KeyRound,
  LogOut,
  ShieldOff,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { adminMutate } from "@/hooks/use-admin-query";
import type {
  AdminAffiliatePortal,
  InviteAffiliateResult,
  PortalActionResult,
} from "@/lib/admin/types";

type AffiliatePortalPanelProps = {
  affiliateId: string;
  affiliateName: string;
  portal: AdminAffiliatePortal;
  onUpdated: () => Promise<void>;
  onViewAsAffiliate?: () => Promise<void>;
};

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function copyText(text: string, label: string) {
  await navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

export function AffiliatePortalPanel({
  affiliateId,
  affiliateName,
  portal,
  onUpdated,
  onViewAsAffiliate,
}: AffiliatePortalPanelProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleInvite() {
    setLoading("invite");
    try {
      const result = await adminMutate<InviteAffiliateResult>(
        `/api/admin/affiliates/${affiliateId}/invite`,
        { method: "POST" }
      );

      if (result.temporaryPassword && result.inviteMessage) {
        await copyText(result.inviteMessage, "Invite message");
        toast.success("Portal login created", {
          description: "Invite message copied to clipboard.",
          duration: 10000,
        });
      } else if (result.linked) {
        toast.success("Portal access linked");
      }

      setInviteOpen(false);
      await onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setLoading(null);
    }
  }

  async function runPortalAction(
    action: "reset-password" | "disable" | "enable" | "sign-out",
    close?: () => void
  ) {
    setLoading(action);
    try {
      const result = await adminMutate<PortalActionResult>(
        `/api/admin/affiliates/${affiliateId}/portal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );

      if (action === "reset-password" && result.inviteMessage) {
        await copyText(result.inviteMessage, "Invite message");
        toast.success("Password reset", {
          description: "New invite message copied to clipboard.",
          duration: 10000,
        });
      } else if (action === "disable") {
        toast.success("Portal access disabled");
      } else if (action === "enable") {
        toast.success("Portal access enabled");
      } else if (action === "sign-out") {
        toast.success("Affiliate signed out everywhere");
      }

      close?.();
      await onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Portal account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Status</span>
            {!portal.hasAccess ? (
              <Badge variant="secondary">No login</Badge>
            ) : portal.disabled ? (
              <Badge variant="destructive">Disabled</Badge>
            ) : (
              <Badge variant="paid">Active</Badge>
            )}
            {portal.mustChangePassword && portal.hasAccess && !portal.disabled && (
              <Badge variant="pending">Must change password</Badge>
            )}
          </div>

          {portal.hasAccess && (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Login email</dt>
                <dd className="font-medium">{portal.loginEmail}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last sign-in</dt>
                <dd className="font-medium">{formatDate(portal.lastSignInAt)}</dd>
              </div>
            </dl>
          )}

          <div className="flex flex-wrap gap-2">
            {!portal.hasAccess ? (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-4 w-4" />
                Create login
              </Button>
            ) : (
              <>
                {onViewAsAffiliate && !portal.disabled && (
                  <Button size="sm" variant="outline" onClick={onViewAsAffiliate}>
                    <Eye className="h-4 w-4" />
                    View as affiliate
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!loading}
                  onClick={() => setResetOpen(true)}
                >
                  <KeyRound className="h-4 w-4" />
                  Reset password
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!loading}
                  onClick={() => runPortalAction("sign-out")}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out everywhere
                </Button>
                {portal.disabled ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!loading}
                    onClick={() => runPortalAction("enable")}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Enable access
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!loading}
                    onClick={() => setDisableOpen(true)}
                  >
                    <ShieldOff className="h-4 w-4" />
                    Disable access
                  </Button>
                )}
              </>
            )}
          </div>

          {!portal.hasAccess && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Creates a login with a temporary password and copies an invite
              message you can send to {affiliateName}.
            </p>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={inviteOpen}
        title="Create portal login?"
        description={`Generates a temporary password for ${portal.loginEmail ?? "this affiliate"} and copies an invite message.`}
        confirmLabel="Create login"
        loading={loading === "invite"}
        onConfirm={handleInvite}
        onCancel={() => setInviteOpen(false)}
      />

      <ConfirmDialog
        open={resetOpen}
        title="Reset portal password?"
        description="Generates a new temporary password and copies an invite message to share."
        confirmLabel="Reset password"
        loading={loading === "reset-password"}
        onConfirm={() => runPortalAction("reset-password", () => setResetOpen(false))}
        onCancel={() => setResetOpen(false)}
      />

      <ConfirmDialog
        open={disableOpen}
        title="Disable portal access?"
        description="The affiliate will be signed out and unable to log in until re-enabled."
        confirmLabel="Disable access"
        loading={loading === "disable"}
        onConfirm={() => runPortalAction("disable", () => setDisableOpen(false))}
        onCancel={() => setDisableOpen(false)}
      />
    </>
  );
}
