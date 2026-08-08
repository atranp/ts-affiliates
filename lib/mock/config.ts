/** Dev-only UI fixtures — never enable in production. */
export function isAffiliateMockMode(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.AFFILIATE_MOCK_DATA === "true";
}
