"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AffiliateHomeCard } from "@/components/affiliate/primitives";
import { ReferralLinkField } from "@/components/affiliate/ReferralLinkField";
import { apiFetch } from "@/lib/api-client";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import type { AffiliateLink } from "@/lib/affiliate/reach";

/**
 * The affiliate's referral link, plus a generator for deep links.
 *
 * Generation goes to the server rather than concatenating here: the link's
 * shape depends on SliceWP settings (the affiliate keyword, whether the id or
 * the slug is used, pretty URLs) that can change without this code knowing.
 */
export function LinksPanel({ link }: { link: AffiliateLink }) {
  const copy = AFFILIATE_COPY.links;

  const [target, setTarget] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    const url = target.trim();
    if (!url) {
      toast.error(copy.generatorEmpty);
      return;
    }

    setGenerating(true);
    try {
      const result = await apiFetch<{ referralUrl: string }>("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      setGenerated(result.referralUrl);
    } catch (error) {
      setGenerated(null);
      toast.error(
        error instanceof Error ? error.message : copy.generatorFailed
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <AffiliateHomeCard title={copy.yourLinkTitle} description={copy.yourLinkDescription}>
        <div className="space-y-4">
          <ReferralLinkField url={link.referralUrl} />

          {link.customSlug ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              {copy.slugInUse}{" "}
              <code className="font-mono font-medium text-brand-dark">
                {link.customSlug}
              </code>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{copy.noSlug}</p>
          )}
        </div>
      </AffiliateHomeCard>

      <AffiliateHomeCard
        title={copy.generatorTitle}
        description={copy.generatorDescription}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="link-target">{copy.generatorLabel}</Label>
            <Input
              id="link-target"
              type="url"
              inputMode="url"
              placeholder={copy.generatorPlaceholder}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleGenerate();
              }}
            />
          </div>

          <Button size="sm" onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {copy.generatorAction}
          </Button>

          {generated ? (
            <ReferralLinkField
              url={generated}
              label={copy.generatorResult}
              className="pt-1"
            />
          ) : null}
        </div>
      </AffiliateHomeCard>
    </div>
  );
}
