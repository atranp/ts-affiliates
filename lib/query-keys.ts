/**
 * Every client query key lives here so invalidation by prefix stays reliable:
 * `["admin"]` and `["ledger"]` are invalidated wholesale after a sync.
 */
export const queryKeys = {
  me: ["me"] as const,
  ledgerAll: ["ledger"] as const,
  ledger: (params: {
    affiliateId?: string;
    page?: number;
    status?: string;
    type?: string;
    directKind?: string;
    sourceAffiliateId?: string;
    teamId?: string;
    q?: string;
    sortBy?: string;
    sortDir?: string;
    from?: string;
    to?: string;
  } = {}) => ["ledger", params] as const,
  commissionDetail: (entryId: string) =>
    ["commission-detail", entryId] as const,
  performance: (params: { period: string; from?: string; to?: string }) =>
    ["performance", params] as const,
  payouts: ["payouts"] as const,
  payout: (id: string) => ["payout", id] as const,
  teams: (affiliateId?: string) => ["teams", affiliateId ?? "self"] as const,
  teamDetail: (teamId: string) => ["team", teamId] as const,
  teamRoster: (affiliateId?: string) =>
    ["team-roster", affiliateId ?? "self"] as const,
  links: ["links"] as const,
  visits: (page: number, outcome: string = "all") =>
    ["visits", page, outcome] as const,
  creatives: ["creatives"] as const,
  coupons: ["coupons"] as const,
  accountSettings: ["account", "settings"] as const,
  affiliateSearch: (q: string) => ["affiliate-search", q] as const,
  admin: {
    all: ["admin"] as const,
    stats: ["admin", "stats"] as const,
    affiliates: (params: {
      page: number;
      q: string;
      status: string;
      pageSize?: number;
    }) => ["admin", "affiliates", params] as const,
    affiliate: (id: string) => ["admin", "affiliate", id] as const,
    dealRules: ["admin", "deal-rules"] as const,
    allTeams: ["admin", "teams-all"] as const,
    sponsorTeams: (sponsorAffiliateId: string) =>
      ["admin", "teams", sponsorAffiliateId] as const,
    team: (teamId: string) => ["admin", "team", teamId] as const,
    payoutBatches: (affiliateId?: string) =>
      affiliateId
        ? (["admin", "payout-batches", affiliateId] as const)
        : (["admin", "payout-batches"] as const),
    payoutBatch: (id: string) => ["admin", "payout-batch", id] as const,
    payoutOptions: (affiliateId: string, refreshedAt: number) =>
      ["admin", "payout-options", affiliateId, refreshedAt] as const,
    payoutDraft: (query: string) => ["admin", "payout-draft", query] as const,
    auditLog: (page: number, action: string) =>
      ["admin", "audit-log", page, action] as const,
    settings: ["admin", "settings"] as const,
    syncStatus: ["admin", "sync-status"] as const,
    payoutWriteBack: ["admin", "payout-write-back"] as const,
  },
};
