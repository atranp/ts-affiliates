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
