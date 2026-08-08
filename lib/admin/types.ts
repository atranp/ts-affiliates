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
  teamsSynced?: number;
};

export type AdminAffiliateProfile = {
  id: string;
  email: string;
  name: string;
  role: string;
  mustChangePassword: boolean;
  portalDisabledAt: string | null;
  lastSignInAt: string | null;
} | null;

export type AdminAffiliatePortal = {
  hasAccess: boolean;
  disabled: boolean;
  mustChangePassword: boolean;
  lastSignInAt: string | null;
  loginEmail: string | null;
};

export type InviteAffiliateResult = {
  created: boolean;
  linked: boolean;
  email: string;
  temporaryPassword?: string;
  profileId: string;
  inviteMessage?: string;
};

export type PortalActionResult = {
  email: string;
  temporaryPassword?: string;
  inviteMessage?: string;
};

export type AdminAffiliateDealRule = {
  id: string;
  name: string;
  type: string;
  ratePercent: string;
  basis: string;
  active: boolean;
  milestoneRevenueThreshold: string | null;
  counterparty: {
    id: string;
    displayName: string | null;
    email: string;
  } | null;
};

export type AdminAffiliateDetail = {
  id: string;
  slicewpId: number;
  email: string;
  paymentEmail: string | null;
  displayName: string | null;
  status: string;
  commissionRate: string | null;
  syncedAt: string | null;
  profile: AdminAffiliateProfile;
  portal: AdminAffiliatePortal;
  ledger: {
    unpaidTotal: number;
    unpaidCount: number;
    paidTotal: number;
    paidCount: number;
    pendingTotal: number;
    pendingCount: number;
    rejectedTotal: number;
    rejectedCount: number;
    directUnpaidTotal: number;
    directUnpaidCount: number;
    overrideTotal: number;
    overrideCount: number;
  };
  dealRules: {
    asSponsor: AdminAffiliateDealRule[];
    asRecruit: AdminAffiliateDealRule[];
  };
};
