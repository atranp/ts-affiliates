/**
 * Commission attribution types — shared by sync, detail API, mocks, and WP audit
 * meta (`_ts_slicewp_attribution_audit`).
 */

import { AFFILIATE_COPY } from "@/lib/affiliate/copy";

export const WINNING_RULES = ["coupon", "link", "lifetime", "none"] as const;

export type WinningRule = (typeof WINNING_RULES)[number];

export function isWinningRule(value: string): value is WinningRule {
  return (WINNING_RULES as readonly string[]).includes(value);
}

/** One row in the commission detail journey timeline. */
export type JourneyStepKind =
  | "click"
  | "cookie"
  | "coupon"
  | "order"
  | "commission"
  | "payout"
  | "customer_linked"
  | "email";

export type JourneyStep = {
  kind: JourneyStepKind;
  label: string;
  at: string;
  meta?: Record<string, string>;
};

/** WP `_ts_slicewp_attribution_audit` — written at commission time (M1). */
export type AttributionAuditCandidates = {
  coupon: { affiliateId: number; codes: string[] };
  link: { affiliateId: number; visitId: number };
  lifetime: { affiliateId: number; customerId: number };
};

export type AttributionAuditOrder = {
  coupons: string[];
  referrerMeta: { affiliateId: number; visitId: number };
  sessionEntryHost: string | null;
};

export type AttributionAudit = {
  version: number;
  recordedAt: string;
  winningRule: WinningRule;
  paidAffiliateId: number;
  commissionId: number;
  commissionType: string;
  candidates: AttributionAuditCandidates;
  order: AttributionAuditOrder;
};

/** Order meta wrapper — multiple line commissions per order. */
export type AttributionAuditStore = {
  version: number;
  commissions: Record<string, AttributionAudit>;
};

export const ATTRIBUTION_AUDIT_META_KEY = "_ts_slicewp_attribution_audit";

export type CommissionJourneyCommission = {
  slicewpId: number;
  type: string;
  amount: string;
  referenceAmount: string | null;
  visitId: number | null;
  customerId: number | null;
  dateCreated: string;
};

export type CommissionJourneyOrder = {
  wooOrderId: number;
  total: string;
  dateCreated: string;
  coupons: string[];
  status: string;
};

export type CommissionJourneyVisit = {
  slicewpId: number;
  landingUrl: string | null;
  referrerUrl: string | null;
  occurredAt: string;
};

export type CommissionJourneyCustomer = {
  slicewpId: number;
  orderCount: number;
  firstOrderId: number | null;
  firstCommissionDate: string | null;
};

/** Bridge `GET /commissions/{id}/journey` — read-only, no buyer PII. */
export type CommissionJourneyPayload = {
  commission: CommissionJourneyCommission;
  order: CommissionJourneyOrder | null;
  visit: CommissionJourneyVisit | null;
  audit: AttributionAudit | null;
  customer: CommissionJourneyCustomer | null;
};

export type CommissionWhyParams = {
  couponCode?: string;
  recruitName?: string;
  orderId?: number;
  /** Link win with a visit row on file — uses richer copy. */
  hasVisitRow?: boolean;
};

/**
 * Affiliate-facing headline for the "Why you earned this" section.
 * Never names other affiliates — see COMMISSION-JOURNEY-PLAN.md M0.
 */
export function commissionWhyHeadline(
  rule: WinningRule,
  params: CommissionWhyParams = {}
): string {
  const copy = AFFILIATE_COPY.commissions.detail.why;

  switch (rule) {
    case "coupon":
      return copy.coupon(params.couponCode ?? "your code");
    case "link":
      return params.hasVisitRow ? copy.linkWithVisit : copy.link;
    case "lifetime":
      return copy.lifetime;
    case "none":
      return copy.none;
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

/** Team OVERRIDE rows — separate from direct-sale winning rules. */
export function commissionOverrideWhyHeadline(
  recruitName: string,
  orderId: number
): string {
  return AFFILIATE_COPY.commissions.detail.why.override(recruitName, orderId);
}

/** Cookie on order but no visit row — distinct from a fresh link click. */
export function commissionCookieNoClickHeadline(): string {
  return AFFILIATE_COPY.commissions.detail.why.cookieNoClick;
}
