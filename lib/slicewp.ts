import { mapWithConcurrency } from "./utils";
import {
  appendWpAuthParams,
  normalizeStoreUrl,
  readApiError,
  sanitizeCredential,
} from "./wordpress-auth";

function formatSliceWPAuthError(status: number, detail: string): string {
  if (detail.includes("invalid_username")) {
    return [
      "SliceWP auth failed: WordPress rejected the request as a user login.",
      "SliceWP keys must be sent as query params only (ck_/cs_ keys), not Basic Auth.",
      "Re-save the SliceWP Consumer Key and Secret from SliceWP → Tools → API Keys.",
    ].join(" ");
  }
  if (status === 401 || detail.includes("rest_forbidden")) {
    return [
      "SliceWP rejected the API credentials (401).",
      "Use keys from WordPress: SliceWP → Settings → Tools → API Keys.",
      "Create Read (or Read/Write) keys tied to an Administrator — not WooCommerce keys.",
      "Re-save both key and secret in Admin → Integrations.",
      detail ? `(${detail})` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return `SliceWP API error: ${status} — ${detail}`;
}

async function slicewpFetch<T>(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const baseUrl = normalizeStoreUrl(storeUrl);
  const key = sanitizeCredential(consumerKey);
  const secret = sanitizeCredential(consumerSecret);

  if (!key || !secret) {
    throw new Error(
      "SliceWP credentials are missing. Add them in Admin → Integrations."
    );
  }

  const search = appendWpAuthParams(new URLSearchParams(params), key, secret);

  const response = await fetch(
    `${baseUrl}/wp-json/slicewp/v1${path}?${search.toString()}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const detail = await readApiError(response);
    throw new Error(formatSliceWPAuthError(response.status, detail));
  }

  return response.json() as Promise<T>;
}

export async function testSliceWPConnection(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string
): Promise<{ ok: true; affiliateCount: number }> {
  const affiliates = await fetchSliceWPAffiliates(
    storeUrl,
    consumerKey,
    consumerSecret,
    0,
    1
  );
  return { ok: true, affiliateCount: affiliates.length >= 0 ? 1 : 0 };
}

export interface SliceWPAffiliate {
  id: number | string;
  user_id?: number | string;
  email?: string;
  payment_email?: string;
  first_name?: string;
  last_name?: string;
  status?: string;
  commission_rate?: string;
  date_created?: string;
  /** SliceWP Multi-level Affiliates add-on */
  parent_id?: number | string;
  parent_affiliate_id?: number | string;
}

export interface SliceWPCommission {
  id: number | string;
  affiliate_id?: number | string;
  reference?: string;
  amount: string;
  /** Order total the commission was calculated from — saves a WooCommerce lookup. */
  reference_amount?: string;
  type?: string;
  origin?: string;
  status?: string;
  parent_id?: number | string;
  date_created?: string;
}

export interface SliceWPPayout {
  id: number | string;
  affiliate_id?: number | string;
  amount?: string;
  status?: string;
  date_created?: string;
}

function normalizeList<T>(data: T[] | T): T[] {
  return Array.isArray(data) ? data : [data];
}

const SLICEWP_PAGE_SIZE = 100;
/** Offset paging is stateless, so pages can be fetched in parallel waves. */
const SLICEWP_PAGE_CONCURRENCY = 5;

async function fetchAllSliceWPPages<T>(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  path: string,
  params: Record<string, string> = {},
  pageConcurrency = SLICEWP_PAGE_CONCURRENCY
): Promise<T[]> {
  const all: T[] = [];
  let waveStart = 0;

  while (true) {
    const offsets = Array.from(
      { length: pageConcurrency },
      (_, index) => waveStart + index * SLICEWP_PAGE_SIZE
    );

    const pages = await mapWithConcurrency(
      offsets,
      pageConcurrency,
      async (offset) =>
        normalizeList(
          await slicewpFetch<T[] | T>(
            storeUrl,
            consumerKey,
            consumerSecret,
            path,
            {
              ...params,
              offset: String(offset),
              number: String(SLICEWP_PAGE_SIZE),
            }
          )
        )
    );

    // A short page means the end of the result set — ignore anything after it.
    const lastPage = pages.findIndex((page) => page.length < SLICEWP_PAGE_SIZE);
    const usable = lastPage === -1 ? pages : pages.slice(0, lastPage + 1);
    for (const page of usable) all.push(...page);

    if (lastPage !== -1) break;
    waveStart += pageConcurrency * SLICEWP_PAGE_SIZE;
  }

  return dedupeById(all);
}

/**
 * Offset paging reads a live table, so a row inserted or removed mid-run
 * shifts everything after it and the same record can come back on two pages.
 * Downstream upserts treat that as a hard error, so collapse it here.
 */
function dedupeById<T>(items: T[]): T[] {
  const byId = new Map<unknown, T>();
  for (const item of items) {
    const id = (item as { id?: unknown }).id;
    byId.set(id ?? Symbol(), item);
  }
  return Array.from(byId.values());
}

export async function fetchSliceWPAffiliates(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  offset = 0,
  number = SLICEWP_PAGE_SIZE
): Promise<SliceWPAffiliate[]> {
  const data = await slicewpFetch<SliceWPAffiliate[] | SliceWPAffiliate>(
    storeUrl,
    consumerKey,
    consumerSecret,
    "/affiliates/",
    {
      offset: String(offset),
      number: String(number),
    }
  );
  return normalizeList(data);
}

export async function fetchSliceWPCommissions(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  params: Record<string, string> = {}
): Promise<SliceWPCommission[]> {
  const data = await slicewpFetch<SliceWPCommission[] | SliceWPCommission>(
    storeUrl,
    consumerKey,
    consumerSecret,
    "/commissions/",
    params
  );
  return normalizeList(data);
}

export async function fetchSliceWPCommissionsByOrder(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  orderId: number
): Promise<SliceWPCommission[]> {
  try {
    return await fetchSliceWPCommissions(storeUrl, consumerKey, consumerSecret, {
      reference: String(orderId),
      origin: "woo",
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      return [];
    }
    throw error;
  }
}

export async function fetchAllSliceWPAffiliates(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string
): Promise<SliceWPAffiliate[]> {
  return fetchAllSliceWPPages<SliceWPAffiliate>(
    storeUrl,
    consumerKey,
    consumerSecret,
    "/affiliates/"
  );
}

/**
 * Sorted oldest-first so milestone thresholds accumulate chronologically.
 * SliceWP's date filters are unreliable, so the sort is applied client-side.
 */
function sortCommissionsByDate(
  commissions: SliceWPCommission[]
): SliceWPCommission[] {
  return commissions.sort((a, b) => {
    const left = a.date_created ?? "";
    const right = b.date_created ?? "";
    if (left === right) return Number(a.id) - Number(b.id);
    return left < right ? -1 : 1;
  });
}

export async function fetchAllSliceWPCommissions(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string
): Promise<SliceWPCommission[]> {
  const commissions = await fetchAllSliceWPPages<SliceWPCommission>(
    storeUrl,
    consumerKey,
    consumerSecret,
    "/commissions/"
  );
  return sortCommissionsByDate(commissions);
}

/** SliceWP filters `/commissions/` by affiliate_id server-side. */
export async function fetchSliceWPCommissionsForAffiliates(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  affiliateSlicewpIds: number[]
): Promise<SliceWPCommission[]> {
  // Most affiliates fit in one page, so page sequentially and spend the
  // concurrency budget on fetching different affiliates instead.
  const pages = await mapWithConcurrency(
    affiliateSlicewpIds,
    SLICEWP_PAGE_CONCURRENCY,
    (affiliateId) =>
      fetchAllSliceWPPages<SliceWPCommission>(
        storeUrl,
        consumerKey,
        consumerSecret,
        "/commissions/",
        { affiliate_id: String(affiliateId) },
        1
      )
  );

  return sortCommissionsByDate(pages.flat());
}

/**
 * `/affiliates/?id=` is ignored by SliceWP — the path route is the only
 * way to fetch a single affiliate.
 */
export async function fetchSliceWPAffiliateById(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  slicewpId: number
): Promise<SliceWPAffiliate | null> {
  try {
    return await slicewpFetch<SliceWPAffiliate>(
      storeUrl,
      consumerKey,
      consumerSecret,
      `/affiliates/${slicewpId}/`
    );
  } catch (error) {
    if (error instanceof Error && /invalid_affiliate_id|404/.test(error.message)) {
      return null;
    }
    throw error;
  }
}

export function mapSliceWPStatus(status?: string): "ACTIVE" | "INACTIVE" | "PENDING" | "REJECTED" {
  switch ((status ?? "").toLowerCase()) {
    case "active":
      return "ACTIVE";
    case "inactive":
      return "INACTIVE";
    case "rejected":
      return "REJECTED";
    default:
      return "PENDING";
  }
}

export function mapSliceWPCommissionStatus(
  status?: string
): "PENDING" | "UNPAID" | "PAID" | "REJECTED" {
  switch ((status ?? "").toLowerCase()) {
    case "paid":
      return "PAID";
    case "rejected":
      return "REJECTED";
    case "pending":
      return "PENDING";
    default:
      return "UNPAID";
  }
}
