import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * End-to-end check of M3 payout write-back against the seeded test cohort.
 *
 * Pays a recruit's direct commissions, confirms SliceWP was told about them,
 * proves the settle is idempotent, then pays the sponsor's override on that
 * same receipt and confirms it correctly settles nothing.
 *
 * This one is destructive by design — it marks cohort commissions paid in both
 * systems. Reset with `npm run cohort teardown && npm run cohort seed`, then
 * `npm run sync:local && npm run cohort rules`.
 *
 * Usage: npm run m3-smoke
 */

import { assertTestAffiliate, emailFor } from "./cohort";

type Check = { name: string; ok: boolean; detail: string };

const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "pass" : "FAIL"}  ${name}\n      ${detail}`);
}

function money(value: number | null): string {
  return value == null ? "—" : `$${value.toFixed(2)}`;
}

async function main() {
  const { isProductionDatabase, isProductionStore } = await import(
    "../lib/env-guard"
  );
  const { getSettings } = await import("../lib/settings");
  const { prisma } = await import("../lib/prisma");
  const { createPayout, previewPayout } = await import("../lib/payouts/create");
  const { settlePayoutBatch } = await import("../lib/payouts/settle");
  const { settlePayment } = await import("../lib/slicewp-bridge");
  const { fetchSliceWPCommissions, fetchAllSliceWPAffiliates } = await import(
    "../lib/slicewp"
  );
  const { PayoutWriteBackStatus } = await import("@prisma/client");

  const settings = await getSettings();

  console.log(`store:      ${settings.wcStoreUrl}`);
  console.log(`database:   ${process.env.NEXT_PUBLIC_SUPABASE_URL}\n`);

  if (isProductionStore(settings.wcStoreUrl) || isProductionDatabase()) {
    throw new Error(
      "This test marks commissions paid. It refuses to run against production."
    );
  }

  const cohort = await prisma.affiliate.findMany({
    where: { email: { in: [emailFor("sponsor"), emailFor("recruit-1")] } },
    select: { id: true, email: true, displayName: true, slicewpId: true },
  });

  const sponsor = cohort.find((row) => row.email === emailFor("sponsor"));
  const recruit = cohort.find((row) => row.email === emailFor("recruit-1"));

  if (!sponsor || !recruit) {
    throw new Error(
      "Test cohort missing. Run: npm run cohort seed && npm run sync:local && npm run cohort rules"
    );
  }

  for (const member of [sponsor, recruit]) {
    assertTestAffiliate({ id: member.slicewpId, payment_email: member.email });
  }

  const cutoff = new Date();

  // 1 — direct payout for the recruit, which is the settle-able case.
  const draft = await previewPayout({
    affiliateId: recruit.id,
    target: { scope: "direct" },
    cutoff,
  });

  if (draft.entryCount === 0) {
    throw new Error(
      `${recruit.displayName} has nothing unpaid. Reseed the cohort to run this again.`
    );
  }

  const payout = await createPayout({
    affiliateId: recruit.id,
    target: { scope: "direct" },
    cutoff,
    expected: { entryCount: draft.entryCount, totalAmount: draft.totalAmount },
  });

  record(
    "direct payout settles in SliceWP",
    payout.writeBack.status === PayoutWriteBackStatus.SETTLED,
    `${payout.entryCount} entries, ${money(payout.totalAmount)} → SliceWP payment `
      + `#${payout.writeBack.slicewpPaymentId ?? "none"} (${payout.writeBack.status})`
      + (payout.writeBack.error ? `\n      ${payout.writeBack.error}` : "")
  );

  record(
    "settled amount matches the batch total",
    Math.round((payout.writeBack.settledAmount ?? 0) * 100)
      === Math.round(payout.totalAmount * 100),
    `batch ${money(payout.totalAmount)} vs settled ${money(payout.writeBack.settledAmount)}`
  );

  // 2 — SliceWP itself should now consider those commissions paid.
  const remoteCommissions = await fetchSliceWPCommissions(
    settings.wcStoreUrl,
    settings.slicewpConsumerKey,
    settings.slicewpConsumerSecret,
    { number: "500" }
  );

  const recruitRemote = remoteCommissions.filter(
    (row) => Number(row.affiliate_id) === recruit.slicewpId
  );
  const allPaid =
    recruitRemote.length > 0
    && recruitRemote.every((row) => String(row.status) === "paid");
  const attached = recruitRemote.filter(
    (row) => Number(row.payment_id) === Number(payout.writeBack.slicewpPaymentId)
  );

  record(
    "SliceWP commissions are marked paid",
    allPaid,
    `${recruitRemote.filter((r) => String(r.status) === "paid").length}/${recruitRemote.length} paid in SliceWP`
  );

  record(
    "SliceWP commissions point at the new payment",
    attached.length === payout.writeBack.commissionCount,
    `${attached.length} of ${payout.writeBack.commissionCount} carry payment_id `
      + `#${payout.writeBack.slicewpPaymentId}`
  );

  // 3 — re-settling an already settled batch must not create a second payment.
  const resettled = await settlePayoutBatch(payout.batchId);

  record(
    "re-settling a settled batch is a no-op",
    resettled.status === PayoutWriteBackStatus.SETTLED
      && resettled.slicewpPaymentId === payout.writeBack.slicewpPaymentId,
    `still payment #${resettled.slicewpPaymentId ?? "none"}`
  );

  // 4 — and the bridge itself replays rather than double-paying, which is what
  //     protects us if the batch row were somehow rolled back to PENDING.
  const replay = await settlePayment({
    affiliate_id: recruit.slicewpId,
    commission_ids: [],
    idempotency_key: payout.batchId,
  });

  record(
    "bridge replays the same payment for a repeated key",
    replay.replayed === true
      && Number(replay.id) === payout.writeBack.slicewpPaymentId,
    `replayed=${replay.replayed}, payment #${replay.id}`
  );

  // 5 — the settlement now exists in both systems. Once the payment mirrors
  //     home it must still read as one receipt, not two.
  const { clearStaleSyncLock, tryBeginSync } = await import("../lib/sync-state");
  const { runFullSyncJob } = await import("../lib/sync");
  const { listDirectPayoutAnchorsForMember } = await import(
    "../lib/payouts/direct-payout-ref"
  );

  await clearStaleSyncLock();
  if (!(await tryBeginSync())) {
    throw new Error("A sync is already running; re-run once it finishes.");
  }
  await runFullSyncJob();

  const mirrored = await prisma.slicewpPayment.count({
    where: { affiliateId: recruit.id, slicewpPaymentId: payout.writeBack.slicewpPaymentId ?? -1 },
  });

  const anchors = await listDirectPayoutAnchorsForMember(recruit.id);
  const forThisBatch = anchors.filter(
    (anchor) => anchor.source === "platform" && anchor.batchId === payout.batchId
  );

  record(
    "settlement mirrors home as a SliceWP payment",
    mirrored === 1,
    `${mirrored} mirrored payment row for #${payout.writeBack.slicewpPaymentId}`
  );

  // A full sync reads SliceWP's own idea of these commissions back over the
  // mirror. The payout must survive that round trip in both directions.
  const survived = await prisma.ledgerEntry.count({
    where: { payoutBatchId: payout.batchId, status: "PAID" },
  });

  record(
    "sync does not un-pay a settled batch",
    survived === payout.entryCount,
    `${survived}/${payout.entryCount} entries still PAID after a full sync`
  );

  record(
    "one anchor per settlement after the payment mirrors back",
    anchors.length === 1 && forThisBatch.length === 1,
    `${anchors.length} anchor(s): ${anchors.map((a) => `${a.source}/${money(a.amount)}`).join(", ")}`
  );

  // 6 — the sponsor's override on that receipt settles nothing, because
  //     overrides have no SliceWP commission behind them.
  const rule = await prisma.dealRule.findFirst({
    where: { sponsorAffiliateId: sponsor.id, sourceAffiliateId: recruit.id },
    select: { teamId: true },
  });

  if (!rule?.teamId) {
    record(
      "override payout settles nothing",
      false,
      "no team-scoped deal rule found — run npm run cohort rules"
    );
  } else {
    const overrideTarget = {
      scope: "member" as const,
      teamId: rule.teamId,
      memberId: recruit.id,
      directPayout: { source: "platform" as const, batchId: payout.batchId },
    };

    const overrideDraft = await previewPayout({
      affiliateId: sponsor.id,
      target: overrideTarget,
      cutoff,
    });

    if (overrideDraft.entryCount === 0) {
      record(
        "override payout settles nothing",
        false,
        "sponsor had no unpaid override entries against that receipt"
      );
    } else {
      const overridePayout = await createPayout({
        affiliateId: sponsor.id,
        target: overrideTarget,
        cutoff,
        expected: {
          entryCount: overrideDraft.entryCount,
          totalAmount: overrideDraft.totalAmount,
        },
      });

      record(
        "override payout settles nothing",
        overridePayout.writeBack.status === PayoutWriteBackStatus.NOT_REQUIRED
          && overridePayout.writeBack.slicewpPaymentId === null,
        `${overridePayout.entryCount} entries, ${money(overridePayout.totalAmount)} paid locally, `
          + `write-back ${overridePayout.writeBack.status}`
      );
    }
  }

  // 7 — a settle that SliceWP rejects must leave the local payout intact and
  //     the batch flagged, not swallow the failure or unwind the payment.
  //     Simulated the way it actually happens: the mirror thinks a commission
  //     is outstanding when SliceWP has already settled it.
  const other = await prisma.affiliate.findFirst({
    where: { email: emailFor("recruit-2") },
    select: { id: true, email: true, displayName: true, slicewpId: true },
  });

  if (other) {
    assertTestAffiliate({ id: other.slicewpId, payment_email: other.email });

    const outstanding = await prisma.ledgerEntry.findFirst({
      where: {
        affiliateId: other.id,
        status: "UNPAID",
        slicewpCommissionId: { not: null },
      },
      select: { slicewpCommissionId: true },
    });

    if (outstanding?.slicewpCommissionId) {
      await settlePayment({
        affiliate_id: other.slicewpId,
        commission_ids: [outstanding.slicewpCommissionId],
        idempotency_key: `qa-drift-${Date.now()}`,
      });

      const conflictDraft = await previewPayout({
        affiliateId: other.id,
        target: { scope: "direct" },
        cutoff,
      });

      const conflicted = await createPayout({
        affiliateId: other.id,
        target: { scope: "direct" },
        cutoff,
        expected: {
          entryCount: conflictDraft.entryCount,
          totalAmount: conflictDraft.totalAmount,
        },
      });

      record(
        "rejected settle flags the batch without losing the payout",
        conflicted.writeBack.status === PayoutWriteBackStatus.FAILED
          && conflicted.entryCount > 0,
        `${conflicted.entryCount} entries still paid locally; write-back `
          + `${conflicted.writeBack.status}: ${conflicted.writeBack.error}`
      );

      const stuckEntries = await prisma.ledgerEntry.count({
        where: { payoutBatchId: conflicted.batchId, status: "PAID" },
      });

      record(
        "failed write-back leaves the ledger settled locally",
        stuckEntries === conflicted.entryCount,
        `${stuckEntries}/${conflicted.entryCount} entries remain PAID`
      );

      const retried = await settlePayoutBatch(conflicted.batchId);
      const batchAfter = await prisma.payoutBatch.findUnique({
        where: { id: conflicted.batchId },
        select: { writeBackAttempts: true },
      });

      record(
        "retry is safe and counted",
        retried.status === PayoutWriteBackStatus.FAILED
          && (batchAfter?.writeBackAttempts ?? 0) >= 2,
        `still FAILED after ${batchAfter?.writeBackAttempts ?? 0} attempts`
      );
    }
  }

  // 8 — the stuck batch has to be findable, or nobody will ever fix it.
  const { getWriteBackHealth } = await import("../lib/payouts/reconcile");
  const health = await getWriteBackHealth();

  record(
    "reconciliation surfaces the stuck batch",
    health.failed >= 1 && health.batches.some((b) => b.error != null),
    `${health.failed} failed, ${health.pending} pending, ${health.drifted} drifted`
  );

  record(
    "settled batches show no drift",
    health.drifted === 0,
    "every settled commission came back paid from SliceWP"
  );

  // 9 — the cohort should be unharmed by all of the above.
  const affiliates = await fetchAllSliceWPAffiliates(
    settings.wcStoreUrl,
    settings.slicewpConsumerKey,
    settings.slicewpConsumerSecret
  );
  const stillThere = affiliates.some((row) => Number(row.id) === recruit.slicewpId);

  record(
    "cohort intact after the run",
    stillThere,
    `${recruit.displayName} still present in SliceWP`
  );

  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);

  if (failed.length > 0) {
    throw new Error(`${failed.length} check(s) failed.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
