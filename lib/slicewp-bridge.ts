import { getSettings } from "./settings";
import type { CommissionJourneyPayload } from "./ledger/attribution-audit";
import {
  appendWpAuthParams,
  normalizeStoreUrl,
  readApiError,
  sanitizeCredential,
} from "./wordpress-auth";

/**
 * Client for the `slicewp-ts/v1` routes added by the True Sciences bridge
 * mu-plugin — the data SliceWP stores but does not expose over its own REST API.
 *
 * Authentication is identical to `lib/slicewp.ts`: the bridge namespace starts
 * with `slicewp-`, which the REST add-on's auth filter matches, so the same
 * consumer key and secret apply.
 *
 * Every read tolerates the plugin being absent. Until Milestone 6 the bridge
 * only exists on Local WordPress, so on production these return empty rather
 * than breaking the page around them.
 */

export type SliceWPCreative = {
  id: number | string;
  name?: string;
  description?: string;
  type?: string;
  image_url?: string;
  alt_text?: string;
  text?: string;
  landing_url?: string;
  status?: string;
  date_created?: string;
  date_modified?: string;
};

export type SliceWPAffiliateCoupons = {
  affiliate_id: number;
  coupons: unknown[];
};

export type SliceWPStoreCredit = {
  affiliate_id: number;
  balance: number;
  currency: string;
};

export type SliceWPAffiliateField = {
  name: string;
  id: string;
  type: string;
  label?: string;
  description?: string | null;
  placeholder?: string;
  is_required?: boolean | number;
  options?: unknown[];
  default_value?: unknown;
  output_conditionals?: Record<string, string[]>;
};

/** Thrown when the mu-plugin is not installed on the target store. */
export class BridgeUnavailableError extends Error {
  constructor(path: string) {
    super(`The SliceWP bridge plugin is not installed on this store (${path}).`);
    this.name = "BridgeUnavailableError";
  }
}

/** Raised when a commission id does not exist on the store. */
export class CommissionNotFoundError extends Error {
  constructor(slicewpCommissionId: number) {
    super(`SliceWP commission ${slicewpCommissionId} was not found.`);
    this.name = "CommissionNotFoundError";
  }
}

async function bridgeFetch<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const settings = await getSettings();

  const key = sanitizeCredential(settings.slicewpConsumerKey);
  const secret = sanitizeCredential(settings.slicewpConsumerSecret);

  if (!key || !secret) {
    throw new Error(
      "SliceWP credentials are missing. Add them in Admin → Integrations."
    );
  }

  const baseUrl = normalizeStoreUrl(settings.wcStoreUrl);
  const search = appendWpAuthParams(new URLSearchParams(params), key, secret);

  const response = await fetch(
    `${baseUrl}/wp-json/slicewp-ts/v1${path}?${search.toString()}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    }
  );

  // WordPress answers 404 for an unregistered route, which is indistinguishable
  // from a missing record without reading the code — so treat it as "plugin not
  // deployed here" and let callers decide.
  if (response.status === 404) {
    throw new BridgeUnavailableError(path);
  }

  if (!response.ok) {
    throw new Error(
      `SliceWP bridge error: ${response.status} — ${await readApiError(response)}`
    );
  }

  return response.json() as Promise<T>;
}

/** Resolves to `fallback` when the bridge is not deployed on this store. */
async function optional<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof BridgeUnavailableError) return fallback;
    throw error;
  }
}

/** Defaults to active only, matching what the WordPress portal shows. */
export async function fetchCreatives(options?: {
  status?: "active" | "inactive";
}): Promise<SliceWPCreative[]> {
  return optional(
    bridgeFetch<SliceWPCreative[]>(
      "/creatives",
      options?.status ? { status: options.status } : {}
    ),
    []
  );
}

export async function fetchAffiliateCoupons(
  slicewpAffiliateId: number
): Promise<unknown[]> {
  const result = await optional(
    bridgeFetch<SliceWPAffiliateCoupons>(
      `/affiliates/${slicewpAffiliateId}/coupons`
    ),
    { affiliate_id: slicewpAffiliateId, coupons: [] }
  );

  return result.coupons;
}

export async function fetchAffiliateStoreCredit(
  slicewpAffiliateId: number
): Promise<SliceWPStoreCredit | null> {
  return optional(
    bridgeFetch<SliceWPStoreCredit | null>(
      `/affiliates/${slicewpAffiliateId}/store-credit`
    ),
    null
  );
}

export async function fetchAffiliateFields(): Promise<SliceWPAffiliateField[]> {
  return optional(bridgeFetch<SliceWPAffiliateField[]>("/affiliate-fields"), []);
}

/** A discount code credited to an affiliate, as the commerce plugin reports it. */
export type SliceWPCoupon = {
  /** Which integration owns it — "woo", "edd", … */
  origin: string;
  id: number | string;
  code: string;
  /** Already formatted for display ("10%", "$5.00"); not a number. */
  amount?: string;
  /** Counts keyed by commission status: paid / unpaid / pending / rejected. */
  uses?: Record<string, number>;
};

export type SliceWPAffiliateExtras = {
  affiliate_id: number;
  custom_slug: string | null;
  /**
   * The link the affiliate is actually given. Reflects the store's configured
   * format, so on a store set to `custom_slug` this already contains the slug.
   */
  referral_url: string;
  /** The slug form specifically, or null when the affiliate has no slug. */
  referral_url_custom_slug: string | null;
  store_credit_balance: number | null;
  currency: string;
  coupons: SliceWPCoupon[];
};

/**
 * Slug, referral link, store credit and coupons for every affiliate at once.
 *
 * These are four separate per-affiliate lookups in WordPress and none of them
 * appear in SliceWP's own REST payload. Fetching them individually would be
 * four round trips per affiliate per sync, so the bridge batches them.
 */
export async function fetchAffiliateExtras(options?: {
  slicewpAffiliateIds?: number[];
  /** Coupons cost a few queries each; skip them when only links are needed. */
  includeCoupons?: boolean;
}): Promise<SliceWPAffiliateExtras[]> {
  const params: Record<string, string> = {};

  if (options?.slicewpAffiliateIds?.length) {
    params.affiliate_ids = options.slicewpAffiliateIds.join(",");
  }
  if (options?.includeCoupons === false) {
    params.include_coupons = "0";
  }

  return optional(
    bridgeFetch<SliceWPAffiliateExtras[]>("/affiliate-extras", params),
    []
  );
}

export type SliceWPSettleRequest = {
  affiliate_id: number;
  commission_ids: number[];
  /** Stable across retries of the same settlement. The batch id. */
  idempotency_key: string;
  amount?: string;
  currency?: string;
  payout_method?: string;
  status?: string;
};

export type SliceWPPaymentReceipt = {
  id: number | string;
  affiliate_id: number | string;
  amount: string | number;
  currency?: string;
  status?: string;
  payout_method?: string;
  commission_ids: number[];
  /** True when this key had already produced a payment and none was created. */
  replayed: boolean;
  date_created?: string;
};

/**
 * A settle request the bridge refused, carrying the WordPress error code.
 *
 * The code matters to the caller: `commission_already_settled` means SliceWP
 * and the mirror disagree about what is outstanding and a human has to look,
 * whereas a timeout just means try again.
 */
export class SliceWPSettleError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number
  ) {
    super(message);
    this.name = "SliceWPSettleError";
  }

  /** Retrying cannot help: the request itself is the problem. */
  get isPermanent(): boolean {
    return this.httpStatus >= 400 && this.httpStatus < 500;
  }
}

/**
 * Records a payment in SliceWP against commissions this app has just paid.
 *
 * Unlike the reads above, a missing plugin is an error rather than an empty
 * result — silently skipping a settlement would leave SliceWP believing the
 * money is still owed.
 */
export async function settlePayment(
  payload: SliceWPSettleRequest
): Promise<SliceWPPaymentReceipt> {
  const { assertWritableStore } = await import("./env-guard");
  const settings = await getSettings();

  assertWritableStore(settings.wcStoreUrl);

  const key = sanitizeCredential(settings.slicewpConsumerKey);
  const secret = sanitizeCredential(settings.slicewpConsumerSecret);

  if (!key || !secret) {
    throw new Error(
      "SliceWP credentials are missing. Add them in Admin → Integrations."
    );
  }

  const baseUrl = normalizeStoreUrl(settings.wcStoreUrl);
  const search = appendWpAuthParams(new URLSearchParams(), key, secret);

  const response = await fetch(
    `${baseUrl}/wp-json/slicewp-ts/v1/payments/settle?${search.toString()}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    }
  );

  if (response.status === 404) {
    throw new SliceWPSettleError(
      new BridgeUnavailableError("/payments/settle").message,
      "bridge_unavailable",
      404
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const code =
      body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string"
        ? (body as { code: string }).code
        : "settle_failed";
    const message =
      body && typeof body === "object" && typeof (body as { message?: unknown }).message === "string"
        ? (body as { message: string }).message
        : `SliceWP settle failed with ${response.status}`;

    throw new SliceWPSettleError(message, code, response.status);
  }

  return response.json() as Promise<SliceWPPaymentReceipt>;
}

/**
 * A referral link for an arbitrary landing page.
 *
 * Built by WordPress rather than assembled here for the same reason the stored
 * referral URL is: the shape depends on the affiliate keyword, the URL format
 * and whether pretty URLs are on, none of which this app controls.
 */
export async function generateAffiliateLink(
  slicewpAffiliateId: number,
  landingUrl?: string
): Promise<string> {
  const response = await bridgeFetch<{ referral_url: string }>(
    `/affiliates/${slicewpAffiliateId}/link`,
    landingUrl ? { url: landingUrl } : {}
  );

  return response.referral_url;
}

/**
 * Read-only commission journey for sync and the affiliate detail drawer.
 *
 * Distinguishes a missing commission (404 + invalid_commission_id) from a
 * missing bridge route (404 without that code).
 */
export async function fetchCommissionJourney(
  slicewpCommissionId: number,
  options: { lite?: boolean } = {}
): Promise<CommissionJourneyPayload> {
  const settings = await getSettings();

  const key = sanitizeCredential(settings.slicewpConsumerKey);
  const secret = sanitizeCredential(settings.slicewpConsumerSecret);

  if (!key || !secret) {
    throw new Error(
      "SliceWP credentials are missing. Add them in Admin → Integrations."
    );
  }

  const baseUrl = normalizeStoreUrl(settings.wcStoreUrl);
  const search = appendWpAuthParams(new URLSearchParams(), key, secret);
  if (options.lite) {
    search.set("lite", "1");
  }

  const response = await fetch(
    `${baseUrl}/wp-json/slicewp-ts/v1/commissions/${slicewpCommissionId}/journey?${search.toString()}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    }
  );

  if (response.status === 404) {
    const body = (await response.json().catch(() => null)) as {
      code?: unknown;
    } | null;

    if (body?.code === "invalid_commission_id") {
      throw new CommissionNotFoundError(slicewpCommissionId);
    }

    throw new BridgeUnavailableError(
      `/commissions/${slicewpCommissionId}/journey`
    );
  }

  if (!response.ok) {
    throw new Error(
      `SliceWP bridge error: ${response.status} — ${await readApiError(response)}`
    );
  }

  return response.json() as Promise<CommissionJourneyPayload>;
}

export type AffiliateSettingsWrite = {
  paymentEmail?: string;
  website?: string;
  customSlug?: string;
};

export type AffiliateSettingsResult = {
  affiliate_id: number;
  payment_email: string | null;
  website: string | null;
  custom_slug: string | null;
  referral_url: string;
};

/**
 * Raised when SliceWP rejects a settings edit. `code` is its own error code, so
 * callers can distinguish a taken slug from a malformed one without parsing
 * the message.
 */
export class AffiliateSettingsError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number
  ) {
    super(message);
    this.name = "AffiliateSettingsError";
  }
}

/**
 * Saves the fields an affiliate may change about themselves.
 *
 * Goes through the bridge rather than `PUT /affiliates/{id}` because SliceWP
 * validates the custom slug in a form hook the REST API never fires. A slug
 * written past that check can collide with another affiliate's, and lookups
 * resolve a single row — so the loser silently stops being credited.
 */
export async function updateAffiliateSettings(
  slicewpAffiliateId: number,
  edit: AffiliateSettingsWrite
): Promise<AffiliateSettingsResult> {
  const { assertWritableStore } = await import("./env-guard");
  const settings = await getSettings();

  assertWritableStore(settings.wcStoreUrl);

  const key = sanitizeCredential(settings.slicewpConsumerKey);
  const secret = sanitizeCredential(settings.slicewpConsumerSecret);

  if (!key || !secret) {
    throw new Error(
      "SliceWP credentials are missing. Add them in Admin → Integrations."
    );
  }

  const body: Record<string, string> = {};
  if (edit.paymentEmail !== undefined) body.payment_email = edit.paymentEmail;
  if (edit.website !== undefined) body.website = edit.website;
  if (edit.customSlug !== undefined) body.custom_slug = edit.customSlug;

  const baseUrl = normalizeStoreUrl(settings.wcStoreUrl);
  const search = appendWpAuthParams(new URLSearchParams(), key, secret);

  const response = await fetch(
    `${baseUrl}/wp-json/slicewp-ts/v1/affiliates/${slicewpAffiliateId}/settings?${search.toString()}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  );

  if (response.status === 404) {
    throw new AffiliateSettingsError(
      new BridgeUnavailableError("/affiliates/{id}/settings").message,
      "bridge_unavailable",
      404
    );
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      code?: unknown;
      message?: unknown;
    } | null;

    throw new AffiliateSettingsError(
      typeof payload?.message === "string"
        ? payload.message
        : `Could not save settings (${response.status}).`,
      typeof payload?.code === "string" ? payload.code : "save_failed",
      response.status
    );
  }

  return response.json() as Promise<AffiliateSettingsResult>;
}

/** Whether the bridge mu-plugin is reachable on the configured store. */
export async function isBridgeAvailable(): Promise<boolean> {
  try {
    await bridgeFetch<SliceWPCreative[]>("/creatives");
    return true;
  } catch (error) {
    if (error instanceof BridgeUnavailableError) return false;
    throw error;
  }
}
