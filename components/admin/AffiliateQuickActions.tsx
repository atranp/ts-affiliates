"use client";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AffiliateQuickActionsProps = {
  affiliateId: string;
  hasPortalAccess: boolean;
  onInvite?: () => void;
  onGoToPayouts?: () => void;
};

export function AffiliateQuickActions({
  affiliateId,
  hasPortalAccess,
  onInvite,
  onGoToPayouts,
}: AffiliateQuickActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {onGoToPayouts ? (
          <DropdownMenuItem onClick={onGoToPayouts}>
            <DollarSign />
            Payouts
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href={`/admin/affiliates/${affiliateId}?tab=payouts`}>
              <DollarSign />
              Payouts
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href={`/admin/deal-rules?sponsorId=${affiliateId}`}>
            <GitBranch />
            Add deal rule
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/admin/deal-rules?sponsorId=${affiliateId}`}>
            <ExternalLink />
            Manage rules
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/admin/teams?sponsorId=${affiliateId}&create=1`}>
            <UsersRound />
            Create team
          </Link>
        </DropdownMenuItem>
        {!hasPortalAccess && onInvite && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onInvite}>
              <UserPlus />
              Portal access
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
