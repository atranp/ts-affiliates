"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  DollarSign,
  ExternalLink,
  GitBranch,
  MoreHorizontal,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type AffiliateQuickActionsProps = {
  affiliateId: string;
  hasPortalAccess: boolean;
  onInvite?: () => void;
};

export function AffiliateQuickActions({
  affiliateId,
  hasPortalAccess,
  onInvite,
}: AffiliateQuickActionsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const items = [
    {
      href: `/admin/payouts?sponsorAffiliateId=${affiliateId}`,
      label: "Run payout",
      icon: DollarSign,
    },
    {
      href: `/admin/deal-rules?sponsorId=${affiliateId}`,
      label: "Add deal rule",
      icon: GitBranch,
    },
    {
      href: `/admin/deal-rules?sponsorId=${affiliateId}`,
      label: "Manage rules",
      icon: ExternalLink,
    },
    {
      href: `/admin/teams?sponsorId=${affiliateId}&create=1`,
      label: "Create team",
      icon: UsersRound,
    },
  ];

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-4 w-4" />
        <span className="sr-only">Actions</span>
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[11rem] rounded-md border border-border bg-card py-1 shadow-lg"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                role="menuitem"
                className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
                onClick={() => setOpen(false)}
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                {item.label}
              </Link>
            );
          })}
          {!hasPortalAccess && onInvite && (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
              onClick={() => {
                setOpen(false);
                onInvite();
              }}
            >
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              Portal access
            </button>
          )}
        </div>
      )}
    </div>
  );
}
