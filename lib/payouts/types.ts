export type PayoutScope = "all" | "team" | "direct";

export type PayoutRecruitLine = {
  sourceAffiliateId: string;
  displayName: string | null;
  email: string;
  overrideTotal: number;
  overrideCount: number;
};

export type PayoutBatchEntry = {
  id: string;
  type: string;
  amount: number;
  status: string;
  description: string | null;
  wooOrderId: number | null;
  orderRevenue: number | null;
  createdAt: string;
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
