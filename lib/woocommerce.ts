import { mapWithConcurrency } from "./utils";
import {
  appendWpAuthParams,
  normalizeStoreUrl,
  readApiError,
} from "./wordpress-auth";

export interface WooOrder {
  id: number;
  total: string;
  status: string;
}

export interface WooCustomer {
  id: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  billing?: { first_name?: string; last_name?: string };
}

const WOO_CUSTOMER_BATCH_SIZE = 100;

/**
 * SliceWP affiliates carry only a `user_id`, so names and account emails have
 * to come from the WordPress user behind them. `wc/v3/customers` exposes those
 * to the same keys the rest of the integration already uses.
 */
export async function fetchWooCustomersByIds(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  userIds: number[]
): Promise<Map<number, WooCustomer>> {
  const unique = Array.from(
    new Set(userIds.filter((id) => Number.isFinite(id) && id > 0))
  );
  if (unique.length === 0 || !consumerKey || !consumerSecret) return new Map();

  const baseUrl = normalizeStoreUrl(storeUrl);
  const batches: number[][] = [];
  for (let i = 0; i < unique.length; i += WOO_CUSTOMER_BATCH_SIZE) {
    batches.push(unique.slice(i, i + WOO_CUSTOMER_BATCH_SIZE));
  }

  const pages = await mapWithConcurrency(batches, 3, async (batch) => {
    const params = appendWpAuthParams(
      new URLSearchParams({
        include: batch.join(","),
        // Affiliates are usually "subscriber"; the default filters them out.
        role: "all",
        per_page: String(WOO_CUSTOMER_BATCH_SIZE),
      }),
      consumerKey,
      consumerSecret
    );
    const url = `${baseUrl}/wp-json/wc/v3/customers?${params.toString()}`;

    // WordPress hosts throttle bursts, and this runs right after the SliceWP
    // page fetches. One retry turns the common transient failure into a hiccup.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        if (response.ok) {
          return (await response.json()) as WooCustomer[];
        }

        const detail = await readApiError(response);
        if (attempt === 1) {
          console.error(
            `WooCommerce customer lookup failed (${response.status}): ${detail}`
          );
        }
      } catch (error) {
        if (attempt === 1) {
          console.error("WooCommerce customer lookup failed:", error);
        }
      }

      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Callers treat a miss as "no enrichment available" and keep stored values.
    return [];
  });

  return new Map(
    pages.flat().map((customer) => [Number(customer.id), customer])
  );
}

export async function fetchWooOrderById(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  orderId: number
): Promise<WooOrder | null> {
  if (!consumerKey || !consumerSecret) return null;

  const baseUrl = normalizeStoreUrl(storeUrl);
  const params = appendWpAuthParams(new URLSearchParams(), consumerKey, consumerSecret);

  const response = await fetch(
    `${baseUrl}/wp-json/wc/v3/orders/${orderId}?${params.toString()}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    }
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await readApiError(response);
    throw new Error(`WooCommerce API error: ${response.status} — ${detail}`);
  }

  return response.json() as Promise<WooOrder>;
}
