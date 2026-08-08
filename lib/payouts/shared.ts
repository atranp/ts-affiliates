import type { PayoutBatchEntry, PayoutRecruitLine } from "./types";

/**
 * Groups a receipt's override lines by the recruit whose sale produced them.
 * Shared by both payout sources so a SliceWP receipt breaks down the same way
 * as one recorded here.
 */
export function recruitBreakdownFromEntries(
  entries: PayoutBatchEntry[]
): PayoutRecruitLine[] {
  const map = new Map<string, PayoutRecruitLine>();

  for (const entry of entries) {
    if (entry.type !== "OVERRIDE" || !entry.sourceAffiliate) continue;
    const id = entry.sourceAffiliate.id;
    const current = map.get(id) ?? {
      sourceAffiliateId: id,
      displayName: entry.sourceAffiliate.displayName,
      email: entry.sourceAffiliate.email,
      overrideTotal: 0,
      overrideCount: 0,
      sourceRevenue: 0,
    };
    current.overrideTotal += entry.amount;
    current.overrideCount += 1;
    current.sourceRevenue += entry.orderRevenue ?? 0;
    map.set(id, current);
  }

  return Array.from(map.values()).sort((a, b) =>
    (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email)
  );
}
