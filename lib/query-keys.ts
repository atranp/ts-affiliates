export const queryKeys = {
  me: ["me"] as const,
  ledger: (params: {
    affiliateId?: string;
    page?: number;
    status?: string;
    type?: string;
    sourceAffiliateId?: string;
    teamId?: string;
    q?: string;
    sortBy?: string;
    sortDir?: string;
    from?: string;
    to?: string;
  } = {}) => ["ledger", params] as const,
  performance: (params: { period: string; from?: string; to?: string }) =>
    ["performance", params] as const,
  payouts: ["payouts"] as const,
  links: ["links"] as const,
  visits: (page: number, outcome: string = "all") =>
    ["visits", page, outcome] as const,
  creatives: ["creatives"] as const,
  coupons: ["coupons"] as const,
  accountSettings: ["account", "settings"] as const,
  admin: {
    stats: ["admin", "stats"] as const,
    affiliates: (params: {
      page: number;
      q: string;
      status: string;
      pageSize?: number;
    }) => ["admin", "affiliates", params] as const,
    affiliate: (id: string) => ["admin", "affiliate", id] as const,
    dealRules: ["admin", "deal-rules"] as const,
    settings: ["admin", "settings"] as const,
    syncStatus: ["admin", "sync-status"] as const,
    payoutWriteBack: ["admin", "payout-write-back"] as const,
  },
};
