/**
 * Payouts are a record-keeping device: money moves by hand outside this system,
 * so a batch is created as PROCESSING ("we owe this") and only becomes COMPLETED
 * once an admin confirms it was actually sent.
 */
export const AWAITING_PAYMENT_STATUS = "PROCESSING";
export const PAID_STATUS = "COMPLETED";

export function isPayoutPaid(status: string): boolean {
  return status === PAID_STATUS;
}

export function payoutStatusLabel(status: string): string {
  return isPayoutPaid(status) ? "Paid" : "Awaiting payment";
}

/**
 * A ledger entry is marked PAID the moment it's claimed by a payout, so that it
 * can't be claimed twice. Until that payout is actually sent, showing the
 * affiliate "Paid" would be a lie — this reports the honest state instead.
 */
export const AWAITING_PAYMENT = "AWAITING_PAYMENT";

export function effectiveLedgerStatus(
  status: string,
  payoutBatch?: { status: string } | null
): string {
  if (status === "PAID" && payoutBatch && !isPayoutPaid(payoutBatch.status)) {
    return AWAITING_PAYMENT;
  }
  return status;
}

/** Tailwind classes for a small status pill, kept in one place. */
export function payoutStatusClasses(status: string): string {
  return isPayoutPaid(status)
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}
