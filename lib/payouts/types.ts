/** Where a payout was recorded: this app, or SliceWP in WordPress. */
export type PayoutSource = "PLATFORM" | "SLICEWP";

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
  source: PayoutSource;
  label: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  processedAt: string | null;
  createdAt: string;
  teamId: string | null;
  teamName: string | null;
  sponsorAffiliateId: string | null;
  /** How SliceWP sent the money, e.g. "manual" or "paypal". */
  payoutMethod: string | null;
  totals: {
    grandTotal: number;
    directTotal: number;
    overrideTotal: number;
    /** Bonuses and adjustments, which are neither a direct sale nor an override. */
    otherTotal: number;
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
  source: PayoutSource;
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
