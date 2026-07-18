export type AdminStats = {
  affiliates: {
    total: number;
    active: number;
    withPortalAccess: number;
  };
  ledger: {
    unpaidTotal: number;
    unpaidCount: number;
    paidTotal: number;
    paidCount: number;
    pendingTotal: number;
  };
  dealRules: {
    active: number;
    total: number;
  };
  sync: {
    lastAffiliateSyncAt: string | null;
    lastCommissionSyncAt: string | null;
    hasWooCommerce: boolean;
    hasSliceWP: boolean;
  };
};

export type AdminAffiliateRow = {
  id: string;
  slicewpId: number;
  email: string;
  displayName: string | null;
  status: string;
  hasPortalAccess: boolean;
  unpaidTotal: number;
};

export type PaginatedAffiliates = {
  items: AdminAffiliateRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type SyncResult = {
  affiliatesUpserted: number;
  commissionsUpserted: number;
  profilesLinked: number;
  overridesCreated: number;
};
