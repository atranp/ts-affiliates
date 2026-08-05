export type PayoutScope = "all" | "team" | "direct" | "recruit";

/**
 * Which date a payout period is measured against.
 *
 * "payout_week" is the scheduled disbursement Monday, which is what a routine
 * weekly run wants. "sale_date" is when the underlying sale happened, which is
 * what you want when reconciling against a partner's own sales report.
 */
export type PayoutDateBasis = "payout_week" | "sale_date";

export type PayoutRecruitLine = {
  sourceAffiliateId: string;
  displayName: string | null;
  email: string;
  overrideTotal: number;
  overrideCount: number;
  /** Sale value behind the bonus, so the effective rate can be shown. */
  sourceRevenue: number;
};

export type PayoutBatchEntry = {
  id: string;
  type: string;
  amount: number;
  status: string;
  description: string | null;
  wooOrderId: number | null;
  orderRevenue: number | null;
  occurredAt: string;
  sourceAffiliate: {
    id: string;
    displayName: string | null;
    email: string;
  } | null;
  dealRule: { id: string; name: string } | null;
};

export type PayoutBatchDetail = {
  id: string;
  label: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  processedAt: string | null;
  createdAt: string;
  teamId: string | null;
  teamName: string | null;
  sponsorAffiliateId: string | null;
  totals: {
    grandTotal: number;
    directTotal: number;
    overrideTotal: number;
    entryCount: number;
  };
  items: Array<{
    affiliateId: string;
    displayName: string | null;
    email: string;
    totalAmount: number;
    entryCount: number;
    directTotal: number;
    overrideTotal: number;
  }>;
  recruitBreakdown: PayoutRecruitLine[];
  entries: PayoutBatchEntry[];
};

export type PayoutBatchListItem = {
  id: string;
  label: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  processedAt: string | null;
  createdAt: string;
  teamId: string | null;
  teamName: string | null;
  sponsorAffiliateId: string | null;
  entryCount: number;
  affiliateCount: number;
  totalAmount: number;
};
