import {
  appendWpAuthParams,
  normalizeStoreUrl,
  sanitizeCredential,
} from "./wordpress-auth";

export const SLICEWP_CREDENTIALS_MISSING =
  "SliceWP credentials are missing. Add them in Admin → Integrations.";

/** Query string with consumer key and secret, or a throw when either is blank. */
export function slicewpAuthParams(
  consumerKey: string,
  consumerSecret: string,
  params: Record<string, string> = {}
): URLSearchParams {
  const key = sanitizeCredential(consumerKey);
  const secret = sanitizeCredential(consumerSecret);

  if (!key || !secret) {
    throw new Error(SLICEWP_CREDENTIALS_MISSING);
  }

  return appendWpAuthParams(new URLSearchParams(params), key, secret);
}

export function slicewpUrl(
  storeUrl: string,
  namespace: "slicewp/v1" | "slicewp-ts/v1",
  path: string,
  search: URLSearchParams
): string {
  return `${normalizeStoreUrl(storeUrl)}/wp-json/${namespace}${path}?${search.toString()}`;
}
