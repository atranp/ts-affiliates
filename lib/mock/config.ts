/** Dev-only UI fixtures — never enable in production. */
export function isAffiliateMockMode(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.AFFILIATE_MOCK_DATA === "true";
}

/** Admin console fixtures — payout builder, affiliate detail, etc. */
export function isAdminMockMode(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.ADMIN_MOCK_DATA === "true";
}
