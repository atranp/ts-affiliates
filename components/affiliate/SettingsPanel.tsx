"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AffiliateHomeCard } from "@/components/affiliate/primitives";
import { ReferralLinkField } from "@/components/affiliate/ReferralLinkField";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import type { AffiliateAccountSettings } from "@/hooks/use-affiliate-reach";

/**
 * The three fields SliceWP lets an affiliate change about themselves.
 *
 * Saves go to WordPress first and only reach the mirror once accepted, because
 * SliceWP owns the rules — notably that a custom slug must be unique. A
 * rejection comes back as its own message so the affiliate can act on it.
 */

type SaveResult = AffiliateAccountSettings & { mirrored: boolean };

export function SettingsPanel({
  settings,
}: {
  settings: AffiliateAccountSettings;
}) {
  const copy = AFFILIATE_COPY.settings;
  const queryClient = useQueryClient();

  const [paymentEmail, setPaymentEmail] = useState(settings.paymentEmail ?? "");
  const [website, setWebsite] = useState(settings.website ?? "");
  const [customSlug, setCustomSlug] = useState(settings.customSlug ?? "");
  const [saving, setSaving] = useState(false);
  const [referralUrl, setReferralUrl] = useState(settings.referralUrl);

  const dirty =
    paymentEmail !== (settings.paymentEmail ?? "") ||
    website !== (settings.website ?? "") ||
    customSlug !== (settings.customSlug ?? "");

  async function handleSave() {
    // Only send what changed, so an untouched field is never rewritten and
    // cannot trip a validation rule the affiliate did not invoke.
    const edit: Record<string, string> = {};
    if (paymentEmail !== (settings.paymentEmail ?? "")) {
      edit.paymentEmail = paymentEmail.trim();
    }
    if (website !== (settings.website ?? "")) {
      edit.website = website.trim();
    }
    if (customSlug !== (settings.customSlug ?? "")) {
      edit.customSlug = customSlug.trim();
    }

    if (Object.keys(edit).length === 0) return;

    setSaving(true);
    try {
      const saved = await apiFetch<SaveResult>("/api/account/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit),
      });

      setReferralUrl(saved.referralUrl);

      // The link and slug appear on other tabs too.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.accountSettings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.links }),
        queryClient.invalidateQueries({ queryKey: queryKeys.creatives }),
      ]);

      toast.success(copy.saved);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : copy.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <AffiliateHomeCard title={copy.panelTitle} description={copy.panelDescription}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="settings-payment-email">
              {copy.fields.paymentEmail}
            </Label>
            <Input
              id="settings-payment-email"
              type="email"
              value={paymentEmail}
              onChange={(event) => setPaymentEmail(event.target.value)}
              placeholder={settings.accountEmail ?? "you@example.com"}
            />
            <p className="text-xs text-muted-foreground">
              {copy.fields.paymentEmailHint}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settings-website">{copy.fields.website}</Label>
            <Input
              id="settings-website"
              type="url"
              inputMode="url"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settings-slug">{copy.fields.customSlug}</Label>
            <Input
              id="settings-slug"
              value={customSlug}
              onChange={(event) => setCustomSlug(event.target.value)}
              placeholder={copy.fields.customSlugPlaceholder}
            />
            <p className="text-xs text-muted-foreground">
              {copy.fields.customSlugHint}
            </p>
          </div>

          <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {copy.save}
          </Button>
        </div>
      </AffiliateHomeCard>

      <div className="flex flex-col gap-4">
        <AffiliateHomeCard
          title={copy.linkPreviewTitle}
          description={copy.linkPreviewDescription}
        >
          <ReferralLinkField url={referralUrl} />
        </AffiliateHomeCard>

        <AffiliateHomeCard
          title={copy.securityTitle}
          description={copy.securityDescription}
        >
          <Button size="sm" variant="outline" asChild>
            <Link href="/account/change-password">
              <KeyRound className="h-4 w-4" />
              {copy.changePassword}
            </Link>
          </Button>
        </AffiliateHomeCard>
      </div>
    </div>
  );
}
