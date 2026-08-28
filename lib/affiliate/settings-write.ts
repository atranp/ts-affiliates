import { prisma } from "@/lib/prisma";
import { shouldMirrorWrites } from "@/lib/env-guard";
import { getSettings } from "@/lib/settings";
import {
  updateAffiliateSettings,
  type AffiliateSettingsWrite,
} from "@/lib/slicewp-bridge";

/**
 * The affiliate's own edits to their SliceWP record.
 *
 * Deliberately narrower than the admin path in `lib/admin/affiliate-write.ts`:
 * an affiliate may change how they are paid and how they are linked to, never
 * their status, commission rate or sponsor. The route resolves the affiliate id
 * from the session, so a caller cannot aim these at someone else.
 */

export type AffiliateSelfEdit = {
  paymentEmail?: string;
  website?: string;
  /** Empty string clears it and reverts the link to the id form. */
  customSlug?: string;
};

export type AffiliateSelfEditResult = {
  paymentEmail: string | null;
  website: string | null;
  customSlug: string | null;
  referralUrl: string;
  /** False when the store and database describe different environments. */
  mirrored: boolean;
};

export async function applyAffiliateSelfEdit(input: {
  affiliateId: string;
  edit: AffiliateSelfEdit;
}): Promise<AffiliateSelfEditResult> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: input.affiliateId },
    select: { id: true, slicewpId: true },
  });

  if (!affiliate) {
    throw new Error("Affiliate not found");
  }

  const payload: AffiliateSettingsWrite = {};
  if (input.edit.paymentEmail !== undefined) {
    payload.paymentEmail = input.edit.paymentEmail;
  }
  if (input.edit.website !== undefined) {
    payload.website = input.edit.website;
  }
  if (input.edit.customSlug !== undefined) {
    payload.customSlug = input.edit.customSlug;
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("No changes to save.");
  }

  const { wcStoreUrl } = await getSettings();

  // SliceWP is the system of record and owns validation, so it goes first and
  // the local row only follows once it has accepted the change.
  const saved = await updateAffiliateSettings(affiliate.slicewpId, payload);

  const mirrored = shouldMirrorWrites(wcStoreUrl);

  if (mirrored) {
    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: {
        paymentEmail: saved.payment_email,
        customSlug: saved.custom_slug,
        website: saved.website,
        // Changing the slug changes the link, so take SliceWP's rebuilt copy
        // rather than leaving the mirror pointing at the old one.
        referralUrl: saved.referral_url,
      },
    });
  }

  return {
    paymentEmail: saved.payment_email,
    website: saved.website,
    customSlug: saved.custom_slug,
    referralUrl: saved.referral_url,
    mirrored,
  };
}
