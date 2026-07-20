"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/PageHeader";
import { ErrorState } from "@/components/admin/ErrorState";
import { StatCardSkeleton } from "@/components/admin/StatCard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminSettings, adminMutate } from "@/hooks/use-admin-query";

function formatSyncTime(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AdminSettingsPage() {
  const { data: settings, error, isLoading, refetch } = useAdminSettings();
  const [wcStoreUrl, setWcStoreUrl] = useState("");
  const [wcConsumerKey, setWcConsumerKey] = useState("");
  const [wcConsumerSecret, setWcConsumerSecret] = useState("");
  const [slicewpConsumerKey, setSlicewpConsumerKey] = useState("");
  const [slicewpConsumerSecret, setSlicewpConsumerSecret] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const body: Record<string, string> = {};
    if (wcStoreUrl) body.wcStoreUrl = wcStoreUrl;
    if (wcConsumerKey) body.wcConsumerKey = wcConsumerKey;
    if (wcConsumerSecret) body.wcConsumerSecret = wcConsumerSecret;
    if (slicewpConsumerKey) body.slicewpConsumerKey = slicewpConsumerKey;
    if (slicewpConsumerSecret) body.slicewpConsumerSecret = slicewpConsumerSecret;

    try {
      await adminMutate("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setWcStoreUrl("");
      setWcConsumerKey("");
      setWcConsumerSecret("");
      setSlicewpConsumerKey("");
      setSlicewpConsumerSecret("");
      toast.success("Settings saved");
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Integration Settings"
        description="WooCommerce and SliceWP credentials for sync jobs"
      />

      {error && (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="flex justify-between gap-4">
              <span>WooCommerce</span>
              <span
                className={
                  settings?.hasWooCommerce ? "font-medium text-success" : "font-medium text-warning"
                }
              >
                {settings?.hasWooCommerce ? "Configured" : "Not configured"}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>SliceWP</span>
              <span
                className={settings?.hasSliceWP ? "font-medium text-success" : "font-medium text-warning"}
              >
                {settings?.hasSliceWP ? "Configured" : "Not configured"}
              </span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-3">
              <span>Last affiliate sync</span>
              <span className="font-medium text-foreground">
                {formatSyncTime(settings?.lastAffiliateSyncAt ?? null)}
              </span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-3">
              <span>Last commission sync</span>
              <span className="font-medium text-foreground">
                {formatSyncTime(settings?.lastCommissionSyncAt ?? null)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>WooCommerce</CardTitle>
            <CardDescription>
              Used to fetch order revenue for override calculations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="wcStoreUrl">Store URL</Label>
                  <Input
                    id="wcStoreUrl"
                    value={wcStoreUrl}
                    onChange={(e) => setWcStoreUrl(e.target.value)}
                    placeholder="https://true-sciences.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wcConsumerKey">Consumer Key</Label>
                  <Input
                    id="wcConsumerKey"
                    value={wcConsumerKey}
                    onChange={(e) => setWcConsumerKey(e.target.value)}
                    placeholder={settings?.hasWooCommerce ? "••••••••" : "Leave blank to keep existing"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wcConsumerSecret">Consumer Secret</Label>
                  <Input
                    id="wcConsumerSecret"
                    type="password"
                    value={wcConsumerSecret}
                    onChange={(e) => setWcConsumerSecret(e.target.value)}
                    placeholder={settings?.hasWooCommerce ? "••••••••" : "Leave blank to keep existing"}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SliceWP</CardTitle>
            <CardDescription>
              REST API keys for affiliate and commission sync
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="slicewpConsumerKey">Consumer Key</Label>
                  <Input
                    id="slicewpConsumerKey"
                    value={slicewpConsumerKey}
                    onChange={(e) => setSlicewpConsumerKey(e.target.value)}
                    placeholder={settings?.hasSliceWP ? "••••••••" : "Leave blank to keep existing"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slicewpConsumerSecret">Consumer Secret</Label>
                  <Input
                    id="slicewpConsumerSecret"
                    type="password"
                    value={slicewpConsumerSecret}
                    onChange={(e) => setSlicewpConsumerSecret(e.target.value)}
                    placeholder={settings?.hasSliceWP ? "••••••••" : "Leave blank to keep existing"}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving || isLoading}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </form>
    </div>
  );
}
