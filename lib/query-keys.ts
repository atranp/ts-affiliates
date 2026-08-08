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
  } = {}) => ["ledger", params] as const,
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
  },
};
