import { formatAppDate } from "@/lib/timezone";

export function formatCurrency(value: number | string) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

/** Sale dates render in the store timezone (WooCommerce / Pacific by default). */
export function formatSaleDate(value: string | Date) {
  return formatAppDate(value);
}

export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : 0;
}

/** Round to cents the way ops spreadsheets do (half-up). */
export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * The sale figure to show beside an earning: the order less shipping and tax,
 * which is what the commission rate was applied to.
 *
 * Falls back to the gross total for orders whose Woo totals have not been
 * fetched, so a row shows a slightly high sale rather than none at all.
 */
export function commissionableSale(entry: {
  commissionBase?: unknown;
  orderRevenue?: unknown;
}): unknown {
  return entry.commissionBase ?? entry.orderRevenue ?? null;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}
