import { completeSync, failSync, formatSyncError, setSyncStep } from "./state";
import { getSettings } from "../settings";
import { prisma } from "../prisma";
import { assertSyncTargetsAgree } from "../env-guard";
import {
  linkOrphanRulesToDownlineTeams,
  syncTeamsFromSliceWP,
} from "../teams/slicewp-sync";
import { syncAffiliatesFromSliceWP } from "./affiliates";
import { syncCommissionsFromSliceWP } from "./commissions";
import { syncParitySafely, syncSlicewpPayoutsSafely } from "./optional-steps";
import { autoLinkUnlinkedProfiles } from "./profiles";

export type SyncResult = {
  affiliatesUpserted: number;
  commissionsUpserted: number;
  profilesLinked: number;
  overridesCreated: number;
  teamsSynced: number;
  slicewpPayoutsSynced: number;
  visitsUpserted: number;
  creativesUpserted: number;
  couponsUpserted: number;
};

async function runFullSync(): Promise<SyncResult> {
  assertSyncTargetsAgree((await getSettings()).wcStoreUrl);

  await setSyncStep("affiliates");
  const affiliatesUpserted = await syncAffiliatesFromSliceWP();

  let teamsSynced = 0;
  try {
    teamsSynced = await syncTeamsFromSliceWP();
    await linkOrphanRulesToDownlineTeams();
  } catch (error) {
    const message = formatSyncError(error);
    if (/slicewpKey|column.*Team|Unknown field/i.test(message)) {
      throw new Error(
        `Team sync failed — production database needs migration (npm run db:push). Details: ${message}`
      );
    }
    throw error;
  }

  await setSyncStep("profiles");
  const profilesLinked = await autoLinkUnlinkedProfiles();
  await setSyncStep("commissions");
  const commissionsUpserted = await syncCommissionsFromSliceWP();

  await setSyncStep("payouts");
  const slicewpPayoutsSynced = await syncSlicewpPayoutsSafely();

  await setSyncStep("parity");
  const parity = await syncParitySafely();

  const overridesCreated = await prisma.ledgerEntry.count({
    where: { type: "OVERRIDE" },
  });

  return {
    affiliatesUpserted,
    commissionsUpserted,
    profilesLinked,
    overridesCreated,
    teamsSynced,
    slicewpPayoutsSynced,
    ...parity,
  };
}

export async function runFullSyncJob(): Promise<SyncResult> {
  try {
    const result = await runFullSync();
    await completeSync(result);
    return result;
  } catch (error) {
    await failSync(error);
    throw error;
  }
}
