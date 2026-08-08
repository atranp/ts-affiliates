export type PayoutScope = "all" | "team" | "direct" | "recruit";

export type PayoutRecruitLine = {
  sourceAffiliateId: string;
  displayName: string | null;
  email: string;
  overrideTotal: number;
  overrideCount: number;
  /** Sale value behind the bonus, so the effective rate can be shown. */
  sourceRevenue: number;
};

/** A single sale behind a payout, shown so the rate can be checked before paying. */
export type PayoutPreviewEntry = {
  id: string;
  occurredAt: string;
  type: string;
  description: string | null;
  wooOrderId: number | null;
  orderRevenue: number | null;
  amount: number;
  affiliateName: string;
  sourceAffiliateName: string | null;
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
