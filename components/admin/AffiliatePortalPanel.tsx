"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Eye,
  KeyRound,
  Loader2,
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
import {
  PortalCredentialsDialog,
  type PortalCredentials,
} from "@/components/admin/PortalCredentialsDialog";
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

export function AffiliatePortalPanel({
  affiliateId,
  affiliateName,
  portal,
  onUpdated,
  onViewAsAffiliate,
}: AffiliatePortalPanelProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<PortalCredentials | null>(null);

  async function handleInvite() {
    setLoading("invite");
    try {
      const result = await adminMutate<InviteAffiliateResult>(
        `/api/admin/affiliates/${affiliateId}/invite`,
        { method: "POST" }
      );

      setInviteOpen(false);

      if (result.temporaryPassword && result.inviteMessage) {
        setCredentials({
          title: "Portal login created",
          description: `${affiliateName} can now sign in with these credentials.`,
          email: result.email,
          temporaryPassword: result.temporaryPassword,
          inviteMessage: result.inviteMessage,
        });
      } else if (result.linked) {
        toast.success("Portal access linked");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
      return;
    } finally {
      setLoading(null);
    }

    await onUpdated();
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

      close?.();

      if (
        action === "reset-password" &&
        result.temporaryPassword &&
        result.inviteMessage
      ) {
        setCredentials({
          title: "Password reset",
          description: `The previous password for ${affiliateName} no longer works.`,
          email: result.email,
          temporaryPassword: result.temporaryPassword,
          inviteMessage: result.inviteMessage,
        });
      } else if (action === "disable") {
        toast.success("Portal access disabled");
      } else if (action === "enable") {
        toast.success("Portal access enabled");
      } else if (action === "sign-out") {
        toast.success("Affiliate signed out everywhere");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
      return;
    } finally {
      setLoading(null);
    }

    await onUpdated();
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
            <dl className="space-y-3 text-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">Login email</dt>
                <dd className="break-all font-medium">{portal.loginEmail}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground">Last sign-in</dt>
                <dd className="font-medium">{formatDate(portal.lastSignInAt)}</dd>
              </div>
            </dl>
          )}

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
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
                  onClick={() => setSignOutOpen(true)}
                >
                  {loading === "sign-out" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  Sign out everywhere
                </Button>
                {portal.disabled ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!loading}
                    onClick={() => runPortalAction("enable")}
                  >
                    {loading === "enable" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
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
              Creates a login with a temporary password and an invite message
              you can send to {affiliateName}.
            </p>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={inviteOpen}
        title="Create portal login?"
        description={`Generates a temporary password for ${portal.loginEmail ?? affiliateName} and an invite message you can send them.`}
        confirmLabel="Create login"
        loading={loading === "invite"}
        onConfirm={handleInvite}
        onCancel={() => setInviteOpen(false)}
      />

      <ConfirmDialog
        open={resetOpen}
        title="Reset portal password?"
        description="The current password stops working immediately. You'll get a new temporary password to share."
        confirmLabel="Reset password"
        loading={loading === "reset-password"}
        onConfirm={() => runPortalAction("reset-password", () => setResetOpen(false))}
        onCancel={() => setResetOpen(false)}
      />

      <ConfirmDialog
        open={signOutOpen}
        title="Sign out everywhere?"
        description={`Ends every active session for ${affiliateName}. Their password still works, so they can sign back in.`}
        confirmLabel="Sign out"
        loading={loading === "sign-out"}
        onConfirm={() => runPortalAction("sign-out", () => setSignOutOpen(false))}
        onCancel={() => setSignOutOpen(false)}
      />

      <ConfirmDialog
        open={disableOpen}
        title="Disable portal access?"
        description={`${affiliateName} will be signed out and blocked from logging in until you re-enable them.`}
        confirmLabel="Disable access"
        destructive
        loading={loading === "disable"}
        onConfirm={() => runPortalAction("disable", () => setDisableOpen(false))}
        onCancel={() => setDisableOpen(false)}
      />

      <PortalCredentialsDialog
        credentials={credentials}
        onClose={() => setCredentials(null)}
      />
    </>
  );
}
