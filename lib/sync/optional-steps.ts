import { Prisma } from "@prisma/client";
import { formatSyncError } from "./state";
import { prisma } from "../prisma";
import {
  isMissingPaymentsEndpoint,
  syncSlicewpPayments,
} from "../payouts/slicewp-sync";
import { syncAffiliateExtras, syncCreatives, syncVisits } from "./parity";

/**
 * Visits, creatives, coupons and referral links.
 *
 * Each is isolated: none of it affects what anyone is owed, so a store without
 * the bridge plugin, or one where a single step fails, should still finish the
 * sync with its money data intact. Failures land in the sync log instead.
 */
export async function syncParitySafely(): Promise<{
  visitsUpserted: number;
  creativesUpserted: number;
  couponsUpserted: number;
}> {
  const step = async <T>(
    type: string,
    run: () => Promise<T>,
    describe: (result: T) => { message: string; metadata: Prisma.InputJsonValue }
  ): Promise<T | null> => {
    try {
      const result = await run();
      const { message, metadata } = describe(result);
      await prisma.syncLog.create({
        data: { type, status: "success", message, metadata },
      });
      return result;
    } catch (error) {
      await prisma.syncLog.create({
        data: { type, status: "error", message: formatSyncError(error) },
      });
      return null;
    }
  };

  const visits = await step("visits", syncVisits, (result) => ({
    message: `${result.incremental ? "Synced" : "Backfilled"} ${result.upserted} visits`,
    metadata: { ...result },
  }));

  const creatives = await step("creatives", syncCreatives, (result) => ({
    message: `Synced ${result.upserted} creatives`,
    metadata: { ...result },
  }));

  const extras = await step("affiliate-extras", syncAffiliateExtras, (result) => ({
    message: `Synced ${result.couponsUpserted} coupons and ${result.slugsFound} custom slugs`,
    metadata: { ...result },
  }));

  return {
    visitsUpserted: visits?.upserted ?? 0,
    creativesUpserted: creatives?.upserted ?? 0,
    couponsUpserted: extras?.couponsUpserted ?? 0,
  };
}

/**
 * Payout receipts are a read-only mirror, so a store whose REST add-on
 * predates `/payments/` should still get its affiliates and commissions
 * rather than failing the whole run.
 */
export async function syncSlicewpPayoutsSafely(
  affiliateIds?: string[]
): Promise<number> {
  try {
    const { upserted, removed } = await syncSlicewpPayments(
      affiliateIds ? { affiliateIds } : undefined
    );
    await prisma.syncLog.create({
      data: {
        type: "slicewp-payouts",
        status: "success",
        message: `Synced ${upserted} SliceWP payouts`,
        metadata: { upserted, removed },
      },
    });
    return upserted;
  } catch (error) {
    const message = formatSyncError(error);
    await prisma.syncLog.create({
      data: {
        type: "slicewp-payouts",
        status: isMissingPaymentsEndpoint(error) ? "skipped" : "error",
        message: isMissingPaymentsEndpoint(error)
          ? "SliceWP has no /payments/ endpoint — update the REST API add-on to import payouts."
          : message,
      },
    });
    return 0;
  }
}
