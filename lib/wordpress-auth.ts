export function normalizeStoreUrl(storeUrl: string): string {
  return storeUrl.trim().replace(/\/$/, "");
}

export function sanitizeCredential(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

export function buildBasicAuthHeader(
  consumerKey: string,
  consumerSecret: string
): string {
  const key = sanitizeCredential(consumerKey);
  const secret = sanitizeCredential(consumerSecret);
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

export function appendWpAuthParams(
  params: URLSearchParams,
  consumerKey: string,
  consumerSecret: string
): URLSearchParams {
  params.set("consumer_key", sanitizeCredential(consumerKey));
  params.set("consumer_secret", sanitizeCredential(consumerSecret));
  return params;
}

export async function readApiError(response: Response): Promise<string> {
  try {
    const body = await response.text();
    if (!body) return response.statusText;
    const parsed = JSON.parse(body) as { message?: string; code?: string };
    if (parsed.message) {
      return parsed.code
        ? `${parsed.message} (${parsed.code})`
        : parsed.message;
    }
    return body.slice(0, 200);
  } catch {
    return response.statusText;
  }
}
