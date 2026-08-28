"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/components/admin/PortalCredentialsDialog";
import { cn } from "@/lib/utils";

/**
 * A referral URL with a copy button.
 *
 * Shared by the affiliate's Links tab and the admin affiliate detail page so
 * the link an admin reads out over support is character-for-character the one
 * the affiliate is looking at.
 */
export function ReferralLinkField({
  url,
  label,
  emptyHint = "Not available yet.",
  className,
}: {
  url: string | null;
  label?: string;
  emptyHint?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!url) return;

    if (await copyToClipboard(url)) {
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Could not copy the link");
    }
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <span className="text-sm text-muted-foreground">{label}</span>
      ) : null}

      {url ? (
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted px-2.5 py-2 font-mono text-xs">
            {url}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            aria-label="Copy referral link"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      )}
    </div>
  );
}
