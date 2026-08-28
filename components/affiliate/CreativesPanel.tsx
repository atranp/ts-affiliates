"use client";

import { useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AffiliateEmptyState,
  AffiliateHomeCard,
} from "@/components/affiliate/primitives";
import { copyToClipboard } from "@/components/admin/PortalCredentialsDialog";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import type { CreativeRow } from "@/lib/affiliate/reach";

/**
 * Marketing assets, each paired with the snippet to paste.
 *
 * The snippet wraps the creative in the affiliate's own referral link, which is
 * the whole point: a banner copied without it earns nothing.
 */

function embedFor(creative: CreativeRow, referralUrl: string | null): string {
  const href = referralUrl ?? creative.landingUrl ?? "";

  if (creative.type === "image" && creative.imageUrl) {
    const alt = creative.altText ?? creative.name;
    return `<a href="${href}"><img src="${creative.imageUrl}" alt="${alt}" /></a>`;
  }

  const text = creative.text ?? creative.name;
  return `<a href="${href}">${text}</a>`;
}

function CreativeCard({
  creative,
  referralUrl,
}: {
  creative: CreativeRow;
  referralUrl: string | null;
}) {
  const copy = AFFILIATE_COPY.creatives;
  const [copied, setCopied] = useState(false);
  const embed = embedFor(creative, referralUrl);

  async function handleCopy() {
    if (await copyToClipboard(embed)) {
      setCopied(true);
      toast.success(copy.copied);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(copy.copyFailed);
    }
  }

  return (
    <AffiliateHomeCard title={creative.name} description={creative.description}>
      <div className="space-y-3">
        {creative.type === "image" && creative.imageUrl ? (
          <div className="relative overflow-hidden rounded-md border border-border bg-muted">
            {/* Unoptimised: these are arbitrary store URLs, not build-time assets. */}
            <Image
              src={creative.imageUrl}
              alt={creative.altText ?? creative.name}
              width={728}
              height={90}
              unoptimized
              className="h-auto w-full object-contain"
            />
          </div>
        ) : creative.text ? (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm leading-relaxed">
            {creative.text}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">
            {copy.embedLabel}
          </span>
          <code className="block max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted px-2.5 py-2 font-mono text-[11px]">
            {embed}
          </code>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={handleCopy}>
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copy.copyAction}
          </Button>

          {creative.landingUrl && (
            <Button size="sm" variant="ghost" asChild>
              <a
                href={creative.landingUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ExternalLink className="h-4 w-4" />
                {copy.previewAction}
              </a>
            </Button>
          )}
        </div>
      </div>
    </AffiliateHomeCard>
  );
}

export function CreativesPanel({
  creatives,
  referralUrl,
}: {
  creatives: CreativeRow[];
  referralUrl: string | null;
}) {
  if (creatives.length === 0) {
    return (
      <AffiliateEmptyState>
        {AFFILIATE_COPY.creatives.empty}
      </AffiliateEmptyState>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {creatives.map((creative) => (
        <CreativeCard
          key={creative.id}
          creative={creative}
          referralUrl={referralUrl}
        />
      ))}
    </div>
  );
}
