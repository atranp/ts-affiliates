/** Shared ledger API shapes — safe for server mocks and client hooks. */

export type LedgerEntry = {
  id: string;
  type: string;
  amount: string;
  status: string;
  description: string | null;
  wooOrderId: number | null;
  orderRevenue: string | null;
  payoutWeek: string | null;
  paidAt: string | null;
  occurredAt: string;
  payoutBatchId: string | null;
  payoutBatch?: { id: string; label: string; status: string } | null;
  sourceAffiliateId: string | null;
  sourceAffiliate?: {
    displayName: string | null;
    email: string;
  } | null;
  dealRule?: { id: string; name: string } | null;
};

export type LedgerData = {
  entries: LedgerEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  /** Sum and count of everything the active filters match, not just this page. */
  filtered: {
    amount: number;
    count: number;
  };
  summary: {
    unpaidTotal: number;
    paidTotal: number;
    pendingTotal: number;
    unpaidCount: number;
    paidCount: number;
    pendingCount: number;
  };
  accountSummary: {
    unpaidTotal: number;
    paidTotal: number;
    pendingTotal: number;
    unpaidCount: number;
    paidCount: number;
    pendingCount: number;
  };
  overrideAccountSummary: {
    unpaidTotal: number;
    paidTotal: number;
    pendingTotal: number;
    unpaidCount: number;
    paidCount: number;
    pendingCount: number;
  };
  tabCounts: {
    all: number;
    unpaid: number;
    paid: number;
    pending: number;
    overrides: number;
    direct: number;
  };
  overrideSummary: {
    unpaidTotal: number;
    paidTotal: number;
    pendingTotal: number;
    unpaidCount: number;
    paidCount: number;
  };
  teamBonuses: Array<{
    sourceAffiliateId: string;
    displayName: string | null;
    email: string;
    unpaidTotal: number;
    unpaidCount: number;
    paidTotal: number;
    paidCount: number;
    pendingTotal: number;
    pendingCount: number;
    milestone: {
      current: number;
      threshold: number;
      met: boolean;
      remaining: number;
    } | null;
  }>;
  sourceAffiliates: Array<{
    id: string;
    displayName: string | null;
    email: string;
  }>;
};
