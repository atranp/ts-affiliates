import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/** Shell can pass prod DB without editing .env.local (dotenv would clobber DATABASE_URL). */
if (process.env.BACKFILL_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.BACKFILL_DATABASE_URL;
  process.env.DIRECT_URL =
    process.env.BACKFILL_DIRECT_URL ?? process.env.BACKFILL_DATABASE_URL;
  process.env.USE_ENV_CREDENTIALS = "false";
  // Settings row holds prod SliceWP keys; force prod store for bridge reads.
  process.env.WC_STORE_URL =
    process.env.BACKFILL_WC_STORE_URL ?? "https://true-sciences.com";
}

/**
 * M8 — Backfill OrderAttribution + commission journey fields from the WP bridge.
 *
 * Read-only on WordPress; writes Supabase only. Default is dry-run.
 *
 * Usage:
 *   npx tsx scripts/backfill-order-attribution.ts
 *   npx tsx scripts/backfill-order-attribution.ts --apply
 *   npx tsx scripts/backfill-order-attribution.ts --apply --limit=50
 *   npx tsx scripts/backfill-order-attribution.ts --apply --affiliate-id=126
 *   npx tsx scripts/backfill-order-attribution.ts --apply --since=2026-08-18
 *   npx tsx scripts/backfill-order-attribution.ts --apply --missing-customer-id
 *   npx tsx scripts/backfill-order-attribution.ts --apply --since=2020-01-01 --missing-customer-id
 */

import { writeFileSync } from "fs";
import { join } from "path";
import type { Commission } from "@prisma/client";
import type { CommissionJourneyPayload } from "../lib/ledger/attribution-audit";

type JourneyDisagreement = {
  commissionSlicewpId: number;
  wooOrderId: number | null;
  paidAffiliateSlicewpId: number;
  auditPaidAffiliateId: number;
  winningRule: string;
  commissionType: string;
  reason: "paid_affiliate_mismatch";
};

type Args = {
  since: Date;
  limit: number | null;
  affiliateSlicewpId: number | null;
  apply: boolean;
  out: string;
  concurrency: number;
  delayMs: number;
  mode: "missing-rule" | "unattempted" | "missing-customer-id";
};

function parseArgs(): Args {
  const raw = process.argv.slice(2);
  const get = (name: string): string | null => {
    const hit = raw.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };

  const sinceRaw = get("since") ?? "2026-08-18";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceRaw)) {
    fail(`--since must look like YYYY-MM-DD, got "${sinceRaw}".`);
  }

  const since = new Date(`${sinceRaw}T00:00:00.000Z`);
  if (Number.isNaN(since.getTime())) {
    fail(`--since is not a valid date: "${sinceRaw}".`);
  }

  const limitRaw = get("limit");
  let limit: number | null = null;
  if (limitRaw !== null) {
    limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit <= 0) {
      fail(`--limit must be a positive integer, got "${limitRaw}".`);
    }
  }

  const affiliateRaw = get("affiliate-id");
  let affiliateSlicewpId: number | null = null;
  if (affiliateRaw !== null) {
    affiliateSlicewpId = Number(affiliateRaw);
    if (!Number.isInteger(affiliateSlicewpId) || affiliateSlicewpId <= 0) {
      fail(`--affiliate-id must be a positive integer, got "${affiliateRaw}".`);
    }
  }

  const concurrencyRaw = get("concurrency") ?? "1";
  const concurrency = Number(concurrencyRaw);
  if (!Number.isInteger(concurrency) || concurrency <= 0 || concurrency > 8) {
    fail(`--concurrency must be 1–8, got "${concurrencyRaw}".`);
  }

  const delayRaw = get("delay-ms") ?? "250";
  const delayMs = Number(delayRaw);
  if (!Number.isInteger(delayMs) || delayMs < 0) {
    fail(`--delay-ms must be a non-negative integer, got "${delayRaw}".`);
  }

  const stamp = sinceRaw;
  const defaultOut = join(
    "docs",
    "reports",
    `journey-backfill-disagreements-${stamp}.csv`
  );

  return {
    since,
    limit,
    affiliateSlicewpId,
    apply: raw.includes("--apply"),
    out: get("out") ?? defaultOut,
    concurrency,
    delayMs,
    mode: raw.includes("--only-unattempted")
      ? "unattempted"
      : raw.includes("--missing-customer-id")
        ? "missing-customer-id"
        : "missing-rule",
  };
}

function fail(...lines: string[]): never {
  console.error(`\n${lines.join("\n")}\n`);
  process.exit(1);
}

function csvEscape(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function writeDisagreementCsv(
  path: string,
  rows: JourneyDisagreement[]
): void {
  const header = [
    "commissionSlicewpId",
    "wooOrderId",
    "paidAffiliateSlicewpId",
    "auditPaidAffiliateId",
    "winningRule",
    "commissionType",
    "reason",
  ];

  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.commissionSlicewpId,
        row.wooOrderId,
        row.paidAffiliateSlicewpId,
        row.auditPaidAffiliateId,
        row.winningRule,
        row.commissionType,
        row.reason,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];

  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

type CommissionWithAffiliate = Commission & {
  affiliate: { slicewpId: number };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableBridgeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /\b(503|502|429)\b/.test(error.message);
}

async function fetchJourneyWithRetry(
  fetchCommissionJourney: (
    id: number,
    options?: { lite?: boolean }
  ) => Promise<CommissionJourneyPayload>,
  commissionId: number,
  attempts = 4
): Promise<CommissionJourneyPayload> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchCommissionJourney(commissionId, { lite: true });
    } catch (error) {
      lastError = error;
      if (!isRetryableBridgeError(error) || attempt === attempts) {
        throw error;
      }
      await sleep(500 * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

async function main() {
  const args = parseArgs();
  const { prisma } = await import("../lib/prisma");
  const syncJourney = await import("../lib/sync-journey");
  const bridge = await import("../lib/slicewp-bridge");

  const {
    applyJourneyToCommission,
    detectJourneyDisagreement,
    journeyPendingWhere,
    mapWithConcurrency,
  } = syncJourney;
  const {
    BridgeUnavailableError,
    fetchCommissionJourney,
    isBridgeAvailable,
  } = bridge;

  const bridgeAvailable = await isBridgeAvailable().catch(() => false);
  if (!bridgeAvailable) {
    fail(
      "SliceWP bridge is unavailable. Check WC_STORE_URL and bridge credentials."
    );
  }

  const where = journeyPendingWhere({
    since: args.since,
    affiliateSlicewpId: args.affiliateSlicewpId ?? undefined,
    mode: args.mode,
  });

  const pending = await prisma.commission.findMany({
    where,
    include: { affiliate: { select: { slicewpId: true } } },
    orderBy: { dateCreated: "asc" },
    ...(args.limit ? { take: args.limit } : {}),
  });

  const totalPending = await prisma.commission.count({ where });

  console.log(
    [
      `Mode: ${args.apply ? "APPLY (writes Supabase)" : "DRY RUN"}`,
      `Filter: ${args.mode}`,
      `Since: ${args.since.toISOString().slice(0, 10)}`,
      args.affiliateSlicewpId
        ? `Affiliate SliceWP id: ${args.affiliateSlicewpId}`
        : "Affiliate: all",
      `Batch: ${pending.length} of ${totalPending} pending`,
      args.limit ? `Limit: ${args.limit}` : "Limit: none",
      `Concurrency: ${args.concurrency}`,
      args.delayMs > 0 ? `Delay: ${args.delayMs}ms` : null,
    ].join("\n")
  );

  if (pending.length === 0) {
    console.log("Nothing to backfill.");
    await prisma.$disconnect();
    return;
  }

  const disagreements: JourneyDisagreement[] = [];
  let enriched = 0;
  let failed = 0;

  await mapWithConcurrency(
    pending as CommissionWithAffiliate[],
    args.concurrency,
    async (commission) => {
      try {
        if (args.delayMs > 0) {
          await sleep(args.delayMs);
        }

        const journey = await fetchJourneyWithRetry(
          fetchCommissionJourney,
          commission.slicewpId
        );
        const disagreement = detectJourneyDisagreement({
          commissionSlicewpId: commission.slicewpId,
          wooOrderId: commission.wooOrderId,
          paidAffiliateSlicewpId: commission.affiliate.slicewpId,
          audit: journey.audit,
        });

        if (disagreement) {
          disagreements.push(disagreement);
        }

        if (args.apply) {
          await applyJourneyToCommission(commission, journey);
        }

        enriched += 1;
      } catch (error) {
        failed += 1;
        if (error instanceof BridgeUnavailableError) {
          throw error;
        }
        console.warn(
          `[backfill-journey] commission ${commission.slicewpId}:`,
          error
        );
      }
    }
  );

  if (disagreements.length > 0) {
    writeDisagreementCsv(args.out, disagreements);
    console.log(
      `Logged ${disagreements.length} disagreement(s) → ${args.out}`
    );
  } else {
    console.log("No reconstruction disagreements detected in this batch.");
  }

  const remaining = args.apply
    ? await prisma.commission.count({ where })
    : totalPending;

  console.log(
    [
      args.apply
        ? `Updated ${enriched} commission(s).`
        : `Would update ${enriched} commission(s). Re-run with --apply to write.`,
      failed > 0 ? `Failed: ${failed}.` : null,
      args.apply ? `Pending remaining: ${remaining}.` : null,
    ]
      .filter(Boolean)
      .join("\n")
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
