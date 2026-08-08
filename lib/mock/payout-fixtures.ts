import { recruitBreakdownFromEntries } from "@/lib/payouts/shared";
import { PAID_STATUS } from "@/lib/payouts/status";
import type {
  PayoutBatchDetail,
  PayoutBatchEntry,
  PayoutBatchListItem,
  PayoutSource,
} from "@/lib/payouts/types";

/**
 * Receipts for the payout screens, generated from a compact spec so the list
 * row and the detail page can never disagree about a total or a line count.
 *
 * Everything is derived from the payout id, so the same fixture comes back on
 * every render and reload — laying out a screen against data that reshuffles
 * underneath you is miserable.
 */

const DAY_MS = 86_400_000;
const now = new Date();

function daysAgo(days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

/** FNV-1a seed into a mulberry32 stream. */
function seededRandom(seed: string): () => number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return () => {
    hash = (hash + 0x6d2b79f5) | 0;
    let t = Math.imul(hash ^ (hash >>> 15), 1 | hash);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Turns relative line weights into amounts that add up to the payout total
 * exactly. Largest remainder keeps the leftover pennies on the biggest lines
 * instead of letting rounding drift show up as a receipt that does not foot.
 */
function scaleToTotal(weights: number[], total: number): number[] {
  const targetCents = Math.round(total * 100);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal <= 0 || weights.length === 0) return weights;

  const raw = weights.map((weight) => (weight / weightTotal) * targetCents);
  const floors = raw.map((value) => Math.max(1, Math.floor(value)));
  let remainder = targetCents - floors.reduce((sum, cents) => sum + cents, 0);

  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  for (let i = 0; remainder > 0 && i < order.length; i += 1) {
    floors[order[i].index] += 1;
    remainder -= 1;
  }
  // Overshoot only happens when the floor clamp above kicked in on tiny lines.
  for (let i = order.length - 1; remainder < 0 && i >= 0; i -= 1) {
    const index = order[i].index;
    if (floors[index] <= 1) continue;
    floors[index] -= 1;
    remainder += 1;
  }

  return floors.map((cents) => cents / 100);
}

export type MockRecruit = {
  id: string;
  displayName: string;
  email: string;
};

/** Ids match the team fixtures so a recruit is the same person everywhere. */
export const MOCK_RECRUITS: Record<string, MockRecruit> = {
  blair: {
    id: "mock-member-blair",
    displayName: "Blair Rodgers",
    email: "blair@example.com",
  },
  pedro: {
    id: "mock-member-pedro",
    displayName: "Pedro Garza",
    email: "pedro@example.com",
  },
  marina: {
    id: "mock-member-marina",
    displayName: "Marina Hales",
    email: "marina@example.com",
  },
  whitney: {
    id: "mock-member-whitney",
    displayName: "Whitney Guthrie",
    email: "whitney@example.com",
  },
};

export type MockPayoutPayee = {
  affiliateId: string;
  displayName: string | null;
  email: string;
  /** Relative weight of the batch this affiliate took home. Defaults to 1. */
  share?: number;
};

export type MockPayoutSpec = {
  id: string;
  source: PayoutSource;
  label: string;
  /** More than one means a batch that covered several affiliates at once. */
  payees: MockPayoutPayee[];
  sponsorAffiliateId: string | null;
  sponsorName: string | null;
  teamId?: string | null;
  teamName?: string | null;
  /** When the transfer was recorded. */
  recordedDaysAgo: number;
  /** How far back the sales it covered reach. */
  periodDays: number;
  entryCount: number;
  totalAmount: number;
  /** Share of the lines credited to a recruit rather than a direct sale. */
  overrideRatio?: number;
  recruits?: MockRecruit[];
  /** Flat lines that are neither a direct sale nor an override. */
  bonuses?: Array<{ description: string; amount: number }>;
  payoutMethod?: string | null;
};

function buildEntries(spec: MockPayoutSpec): PayoutBatchEntry[] {
  const random = seededRandom(spec.id);
  const recruits = spec.recruits ?? [];
  const overrideRatio = recruits.length > 0 ? (spec.overrideRatio ?? 0) : 0;
  const bonuses = spec.bonuses ?? [];
  const bonusTotal = bonuses.reduce((sum, bonus) => sum + bonus.amount, 0);

  const drafts = Array.from({ length: spec.entryCount }, (_, index) => {
    const isOverride = random() < overrideRatio;
    const recruit = isOverride
      ? recruits[Math.floor(random() * recruits.length)]
      : null;

    // Overrides pay a flat team rate; direct sales sit around the SliceWP rate.
    const rate = isOverride ? 0.1 : 0.26 + random() * 0.08;
    const wooOrderId = 9_400 - index * 3 - Math.floor(random() * 3);
    const occurredAt = daysAgo(
      spec.recordedDaysAgo +
        Math.round((index / Math.max(1, spec.entryCount - 1)) * spec.periodDays)
    );

    return {
      isOverride,
      recruit,
      rate,
      weight: 0.5 + random(),
      wooOrderId,
      occurredAt,
    };
  });

  const scaled = scaleToTotal(
    drafts.map((draft) => draft.weight),
    Math.max(0, spec.totalAmount - bonusTotal)
  );

  const lines: PayoutBatchEntry[] = drafts.map((draft, index) => ({
    id: `${spec.id}-entry-${index}`,
    type: draft.isOverride ? "OVERRIDE" : "DIRECT",
    amount: scaled[index],
    status: "PAID",
    description: draft.recruit
      ? `${draft.recruit.displayName} · Order #${draft.wooOrderId}`
      : `Order #${draft.wooOrderId}`,
    wooOrderId: draft.wooOrderId,
    // Backed out of the commission so the rate the UI shows stays believable.
    orderRevenue: round(scaled[index] / draft.rate),
    occurredAt: draft.occurredAt,
    sourceAffiliate: draft.recruit
      ? {
          id: draft.recruit.id,
          displayName: draft.recruit.displayName,
          email: draft.recruit.email,
        }
      : null,
    dealRule: draft.isOverride
      ? { id: "mock-rule-downline", name: "Downline override · 10%" }
      : null,
  }));

  bonuses.forEach((bonus, index) => {
    lines.push({
      id: `${spec.id}-bonus-${index}`,
      type: "BONUS",
      amount: bonus.amount,
      status: "PAID",
      description: bonus.description,
      wooOrderId: null,
      orderRevenue: null,
      occurredAt: daysAgo(spec.recordedDaysAgo + 1),
      sourceAffiliate: null,
      dealRule: { id: "mock-rule-bonus", name: "Milestone bonus" },
    });
  });

  return lines.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function splitTotals(entries: PayoutBatchEntry[]) {
  let directTotal = 0;
  let overrideTotal = 0;
  let otherTotal = 0;

  for (const entry of entries) {
    if (entry.type === "DIRECT") directTotal += entry.amount;
    else if (entry.type === "OVERRIDE") overrideTotal += entry.amount;
    else otherTotal += entry.amount;
  }

  return {
    directTotal: round(directTotal),
    overrideTotal: round(overrideTotal),
    otherTotal: round(otherTotal),
  };
}

/**
 * Splits the batch across its payees. The last one absorbs the rounding so the
 * per-affiliate rows still add up to the headline total.
 */
function buildItems(
  spec: MockPayoutSpec,
  totals: { directTotal: number; overrideTotal: number; otherTotal: number },
  entryCount: number
): PayoutBatchDetail["items"] {
  const weights = spec.payees.map((payee) => payee.share ?? 1);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const grandTotal = round(
    totals.directTotal + totals.overrideTotal + totals.otherTotal
  );

  let assigned = 0;
  let assignedEntries = 0;

  return spec.payees.map((payee, index) => {
    const isLast = index === spec.payees.length - 1;
    const share = weights[index] / weightTotal;

    const totalAmount = isLast
      ? round(grandTotal - assigned)
      : round(grandTotal * share);
    const lineCount = isLast
      ? entryCount - assignedEntries
      : Math.max(1, Math.round(entryCount * share));

    assigned = round(assigned + totalAmount);
    assignedEntries += lineCount;

    return {
      affiliateId: payee.affiliateId,
      displayName: payee.displayName,
      email: payee.email,
      totalAmount,
      entryCount: lineCount,
      directTotal: round(totals.directTotal * share),
      overrideTotal: round(totals.overrideTotal * share),
    };
  });
}

export function buildMockPayoutDetail(
  spec: MockPayoutSpec
): PayoutBatchDetail {
  const entries = buildEntries(spec);
  const totals = splitTotals(entries);
  const { directTotal, overrideTotal, otherTotal } = totals;
  const recordedAt = daysAgo(spec.recordedDaysAgo);

  return {
    id: spec.id,
    source: spec.source,
    label: spec.label,
    status: PAID_STATUS,
    periodStart: daysAgo(spec.recordedDaysAgo + spec.periodDays),
    periodEnd: recordedAt,
    processedAt: recordedAt,
    createdAt: recordedAt,
    teamId: spec.teamId ?? null,
    teamName: spec.teamName ?? null,
    sponsorAffiliateId: spec.sponsorAffiliateId,
    payoutMethod: spec.payoutMethod ?? null,
    totals: {
      grandTotal: round(directTotal + overrideTotal + otherTotal),
      directTotal,
      overrideTotal,
      otherTotal,
      entryCount: entries.length,
    },
    items: buildItems(spec, totals, entries.length),
    recruitBreakdown: recruitBreakdownFromEntries(entries),
    entries,
  };
}

export function buildMockPayoutListItem(
  spec: MockPayoutSpec
): PayoutBatchListItem {
  const detail = buildMockPayoutDetail(spec);

  return {
    id: detail.id,
    source: detail.source,
    label: detail.label,
    status: detail.status,
    periodStart: detail.periodStart,
    periodEnd: detail.periodEnd,
    processedAt: detail.processedAt,
    createdAt: detail.createdAt,
    teamId: detail.teamId,
    teamName: detail.teamName,
    sponsorAffiliateId: detail.sponsorAffiliateId,
    entryCount: detail.totals.entryCount,
    affiliateCount: detail.items.length,
    totalAmount: detail.totals.grandTotal,
  };
}
