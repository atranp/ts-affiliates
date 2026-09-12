import { mapWithConcurrency } from "./utils";
import {
  appendWpAuthParams,
  normalizeStoreUrl,
  readApiError,
} from "./wordpress-auth";

/** WooCommerce admin edit screen (HPOS). */
export function wooOrderAdminUrl(storeUrl: string, orderId: number): string {
  const base = normalizeStoreUrl(storeUrl);
  return `${base}/wp-admin/admin.php?page=wc-orders&action=edit&id=${orderId}`;
}

export interface WooOrder {
  id: number;
  total: string;
  status: string;
  shipping_total?: string;
  total_tax?: string;
  discount_total?: string;
}

/** The order figures a commission is actually calculated on. */
export interface WooOrderTotals {
  id: number;
  total: number;
  shipping: number;
  tax: number;
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

const WOO_ORDER_BATCH_SIZE = 100;

/**
 * Order totals for many orders at once.
 *
 * The commission bridge exposes order figures one commission at a time, which
 * costs a request per sale — hours across the whole ledger. `wc/v3/orders`
 * accepts up to 100 ids per call, turning the same work into a handful of
 * requests. Reads only; nothing here writes to the store.
 *
 * Woo omits orders it won't serve (trashed, or outside the key's permissions)
 * rather than erroring, so a missing id means "no totals available" and callers
 * should leave stored values alone.
 */
export async function fetchWooOrderTotalsByIds(
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
  orderIds: number[],
  options: { concurrency?: number; onBatch?: (done: number) => void } = {}
): Promise<Map<number, WooOrderTotals>> {
  const unique = Array.from(
    new Set(orderIds.filter((id) => Number.isFinite(id) && id > 0))
  );
  if (unique.length === 0 || !consumerKey || !consumerSecret) return new Map();

  const baseUrl = normalizeStoreUrl(storeUrl);
  const batches: number[][] = [];
  for (let i = 0; i < unique.length; i += WOO_ORDER_BATCH_SIZE) {
    batches.push(unique.slice(i, i + WOO_ORDER_BATCH_SIZE));
  }

  let completed = 0;

  const pages = await mapWithConcurrency(
    batches,
    options.concurrency ?? 2,
    async (batch) => {
      const params = appendWpAuthParams(
        new URLSearchParams({
          include: batch.join(","),
          per_page: String(WOO_ORDER_BATCH_SIZE),
          // Commissions exist for refunded and cancelled orders too, and the
          // default status filter would hide them.
          status: "any",
        }),
        consumerKey,
        consumerSecret
      );
      const url = `${baseUrl}/wp-json/wc/v3/orders?${params.toString()}`;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await fetch(url, {
            headers: { Accept: "application/json" },
            cache: "no-store",
          });

          if (response.ok) {
            const orders = (await response.json()) as WooOrder[];
            completed += 1;
            options.onBatch?.(completed);
            return orders;
          }

          const detail = await readApiError(response);
          if (attempt === 2) {
            console.error(
              `WooCommerce order lookup failed (${response.status}): ${detail}`
            );
          }
        } catch (error) {
          if (attempt === 2) {
            console.error("WooCommerce order lookup failed:", error);
          }
        }

        // Back off rather than hammering a host that just refused us.
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }

      completed += 1;
      options.onBatch?.(completed);
      return [];
    }
  );

  const totals = new Map<number, WooOrderTotals>();
  for (const order of pages.flat()) {
    const id = Number(order.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    totals.set(id, {
      id,
      total: Number(order.total ?? 0),
      shipping: Number(order.shipping_total ?? 0),
      tax: Number(order.total_tax ?? 0),
      status: order.status,
    });
  }

  return totals;
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
