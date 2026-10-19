/** Badge variant for an affiliate account's SliceWP status. */
export function affiliateStatusBadgeVariant(
  status: string
): "paid" | "pending" | "secondary" | "destructive" {
  switch (status) {
    case "ACTIVE":
      return "paid";
    case "PENDING":
      return "pending";
    case "REJECTED":
      return "destructive";
    default:
      return "secondary";
  }
}
