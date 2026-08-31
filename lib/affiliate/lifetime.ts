/** SliceWP lifetime add-on commission type — shown on the platform, hidden on SliceWP after cutover. */
export const SLICEWP_LIFETIME_SALE_TYPE = "lifetime_sale";

export function isLifetimeSaleType(type: string | null | undefined): boolean {
  return (type ?? "").toLowerCase() === SLICEWP_LIFETIME_SALE_TYPE;
}

export function isLifetimeCommission(
  ledgerType: string,
  isLifetimeSale?: boolean
): boolean {
  return Boolean(isLifetimeSale || isLifetimeSaleType(ledgerType));
}
