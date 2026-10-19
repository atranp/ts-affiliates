import type { PayoutTarget } from "@/lib/payouts/create";

/** Query/body params that identify a payout target to the create endpoints. */
export function payoutTargetParams(target: PayoutTarget): Record<string, string> {
  if (target.scope === "member") {
    const ref =
      target.directPayout.source === "slicewp"
        ? {
            directPayoutSource: "slicewp",
            directPayoutId: target.directPayout.paymentId,
          }
        : {
            directPayoutSource: "platform",
            directPayoutId: target.directPayout.batchId,
          };
    return {
      scope: "member",
      teamId: target.teamId,
      memberId: target.memberId,
      ...ref,
    };
  }
  return { scope: target.scope };
}
