import {
  appendWpAuthParams,
  normalizeStoreUrl,
  readApiError,
} from "./wordpress-auth";

async function slicewpFetch<T>(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const baseUrl = normalizeStoreUrl(storeUrl);
  const search = appendWpAuthParams(
    new URLSearchParams(params),
    consumerKey,
    consumerSecret
  );

  const response = await fetch(
    `${baseUrl}/wp-json/slicewp/v1${path}?${search.toString()}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const detail = await readApiError(response);
    throw new Error(`SliceWP API error: ${response.status} — ${detail}`);
  }

  return response.json() as Promise<T>;
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

async function fetchAllSliceWPPages<T>(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  path: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;

  while (true) {
    const data = await slicewpFetch<T[] | T>(
      storeUrl,
      consumerKey,
      consumerSecret,
      path,
      {
        ...params,
        offset: String(offset),
        number: String(SLICEWP_PAGE_SIZE),
      }
    );
    const batch = normalizeList(data);
    if (batch.length === 0) break;

    all.push(...batch);
    offset += batch.length;
  }

  return all;
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

export async function fetchAllSliceWPCommissionsSince(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  since?: Date
): Promise<SliceWPCommission[]> {
  const params: Record<string, string> = {
    orderby: "date_created",
    order: "DESC",
  };
  if (since) {
    params.after = since.toISOString();
  }

  return fetchAllSliceWPPages<SliceWPCommission>(
    storeUrl,
    consumerKey,
    consumerSecret,
    "/commissions/",
    params
  );
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
