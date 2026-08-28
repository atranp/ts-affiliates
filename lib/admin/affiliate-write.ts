import { AffiliateStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { shouldMirrorWrites } from "@/lib/env-guard";
import { getSettings } from "@/lib/settings";
import { logAdminAction } from "./audit-log";
import {
  updateSliceWPAffiliate,
  type AffiliateWritePayload,
  type SliceWPAffiliateStatus,
} from "@/lib/slicewp-write";

/**
 * Admin edits to an affiliate, applied to SliceWP first and mirrored locally.
 *
 * SliceWP is the system of record, so the local row is only updated after the
 * remote write succeeds. The mirror update is a convenience — it keeps the UI
 * honest until the next sync — not a source of truth.
 */

export type AffiliateEdit = {
  status?: AffiliateStatus;
  paymentEmail?: string;
  /** Percentage. `null` clears the per-affiliate override. */
  commissionRate?: number | null;
  /** `null` detaches the affiliate from its sponsor. */
  parentSlicewpId?: number | null;
  customSlug?: string;
};

const STATUS_TO_SLICEWP: Record<AffiliateStatus, SliceWPAffiliateStatus> = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  PENDING: "pending",
  REJECTED: "rejected",
};

/**
 * A rate written on its own is silently ignored: SliceWP Pro checks
 * `enable_commission_rates` before reading `commission_rate_sale`, so the flag
 * has to travel with it.
 */
function commissionRateMeta(rate: number | null) {
  if (rate === null) {
    return { enable_commission_rates: "" };
  }

  return {
    enable_commission_rates: 1,
    commission_rate_sale: rate,
    commission_rate_type_sale: "percentage",
  };
}

function buildPayload(edit: AffiliateEdit): AffiliateWritePayload {
  const payload: AffiliateWritePayload = {};
  const meta: Record<string, string | number | null> = {};

  if (edit.status !== undefined) {
    payload.status = STATUS_TO_SLICEWP[edit.status];
  }

  if (edit.paymentEmail !== undefined) {
    payload.payment_email = edit.paymentEmail;
  }

  if (edit.parentSlicewpId !== undefined) {
    // SliceWP stores "no sponsor" as 0 rather than null.
    payload.parent_id = edit.parentSlicewpId ?? 0;
  }

  if (edit.commissionRate !== undefined) {
    Object.assign(meta, commissionRateMeta(edit.commissionRate));
  }

  if (edit.customSlug !== undefined) {
    meta.custom_slug = edit.customSlug;
  }

  if (Object.keys(meta).length > 0) {
    payload.meta_data = meta;
  }

  return payload;
}

export type AffiliateEditResult = {
  affiliateId: string;
  slicewpId: number;
  applied: AffiliateEdit;
  /** False when the store and database describe different environments. */
  mirrored: boolean;
};

export async function applyAffiliateEdit(input: {
  affiliateId: string;
  edit: AffiliateEdit;
  adminId: string;
}): Promise<AffiliateEditResult> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: input.affiliateId },
    select: {
      id: true,
      slicewpId: true,
      status: true,
      paymentEmail: true,
      commissionRate: true,
      parentSlicewpId: true,
    },
  });

  if (!affiliate) {
    throw new Error("Affiliate not found");
  }

  const payload = buildPayload(input.edit);

  if (Object.keys(payload).length === 0) {
    throw new Error("No changes to write.");
  }

  const { wcStoreUrl } = await getSettings();

  await updateSliceWPAffiliate(affiliate.slicewpId, payload);

  const mirrored = shouldMirrorWrites(wcStoreUrl);

  if (mirrored) {
    // Resolve the new sponsor's local row so the tree stays navigable before
    // the next full sync. An unknown sponsor is left unlinked rather than
    // rejected — sync will attach it once that affiliate exists locally.
    let parentAffiliateId: string | null | undefined;

    if (input.edit.parentSlicewpId !== undefined) {
      parentAffiliateId =
        input.edit.parentSlicewpId === null
          ? null
          : (
              await prisma.affiliate.findUnique({
                where: { slicewpId: input.edit.parentSlicewpId },
                select: { id: true },
              })
            )?.id ?? null;
    }

    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: {
        ...(input.edit.status !== undefined && { status: input.edit.status }),
        ...(input.edit.paymentEmail !== undefined && {
          paymentEmail: input.edit.paymentEmail,
        }),
        ...(input.edit.commissionRate !== undefined && {
          commissionRate: input.edit.commissionRate,
        }),
        ...(input.edit.parentSlicewpId !== undefined && {
          parentSlicewpId: input.edit.parentSlicewpId,
          parentAffiliateId,
        }),
      },
    });
  }

  await logAdminAction({
    adminId: input.adminId,
    action: "AFFILIATE_UPDATE",
    affiliateId: affiliate.id,
    metadata: {
      slicewpId: affiliate.slicewpId,
      store: wcStoreUrl,
      mirrored,
      changes: input.edit as Record<string, unknown>,
      previous: {
        status: affiliate.status,
        paymentEmail: affiliate.paymentEmail,
        commissionRate: affiliate.commissionRate?.toString() ?? null,
        parentSlicewpId: affiliate.parentSlicewpId,
      },
    },
  });

  return {
    affiliateId: affiliate.id,
    slicewpId: affiliate.slicewpId,
    applied: input.edit,
    mirrored,
  };
}
