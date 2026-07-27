import { waitUntil } from "@vercel/functions";
import { applyDealRuleRetroactively } from "@/lib/rules-engine";

export function scheduleDealRuleBackfill(ruleId: string): void {
  const job = () =>
    applyDealRuleRetroactively(ruleId)
      .then((count) => {
        console.info(`Deal rule backfill finished (${ruleId}): ${count} entries`);
      })
      .catch((error) => {
        console.error(`Deal rule backfill failed (${ruleId}):`, error);
      });

  waitUntil(job());
}
