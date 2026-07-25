import Link from "next/link";
import { DollarSign, GitBranch, UserPlus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AffiliateQuickActions({
  affiliateId,
  hasPortalAccess,
  onInvite,
}: {
  affiliateId: string;
  hasPortalAccess: boolean;
  onInvite?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link
          href={`/admin/payouts?sponsorAffiliateId=${affiliateId}`}
        >
          <DollarSign className="mr-2 h-4 w-4" />
          Run payout
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/admin/deal-rules?sponsorId=${affiliateId}`}>
          <GitBranch className="mr-2 h-4 w-4" />
          Add deal rule
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/admin/teams?sponsorId=${affiliateId}&create=1`}>
          <UsersRound className="mr-2 h-4 w-4" />
          Create team
        </Link>
      </Button>
      {!hasPortalAccess && onInvite && (
        <Button variant="secondary" size="sm" onClick={onInvite}>
          <UserPlus className="mr-2 h-4 w-4" />
          Portal access
        </Button>
      )}
    </div>
  );
}
