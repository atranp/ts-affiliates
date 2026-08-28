import { assertWritableStore } from "./env-guard";
import { getSettings } from "./settings";
import {
  appendWpAuthParams,
  normalizeStoreUrl,
  readApiError,
  sanitizeCredential,
} from "./wordpress-auth";
import type { SliceWPAffiliate } from "./slicewp";

/**
 * Mutating counterpart to `lib/slicewp.ts`.
 *
 * Kept separate from the read client on purpose: every export here goes through
 * `assertWritableStore()` first, so the guard cannot be forgotten by adding one
 * more function to a file where most callers are harmless reads.
 */

/** Statuses SliceWP accepts for an affiliate. */
export type SliceWPAffiliateStatus =
  | "active"
  | "inactive"
  | "pending"
  | "rejected";

export type AffiliateWritePayload = {
  status?: SliceWPAffiliateStatus;
  payment_email?: string;
  website?: string;
  parent_id?: number;
  meta_data?: Record<string, string | number | null>;
};

/**
 * Low-level guarded request. Exported so scripts that need endpoints outside
 * this module's domain API (seeding test data, for instance) still go through
 * `assertWritableStore()` rather than hand-rolling a fetch that skips it.
 */
export async function slicewpWrite<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: Record<string, unknown>
): Promise<T> {
  const settings = await getSettings();

  assertWritableStore(settings.wcStoreUrl);

  const key = sanitizeCredential(settings.slicewpConsumerKey);
  const secret = sanitizeCredential(settings.slicewpConsumerSecret);

  if (!key || !secret) {
    throw new Error(
      "SliceWP credentials are missing. Add them in Admin → Integrations."
    );
  }

  const baseUrl = normalizeStoreUrl(settings.wcStoreUrl);
  const search = appendWpAuthParams(new URLSearchParams(), key, secret);

  const response = await fetch(
    `${baseUrl}/wp-json/slicewp/v1${path}?${search.toString()}`,
    {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const detail = await readApiError(response);

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `SliceWP rejected the write (${response.status}). Writes need a Read/Write API key owned by an administrator — a Read key returns this even when the credentials are valid. (${detail})`
      );
    }

    throw new Error(`SliceWP write failed: ${response.status} — ${detail}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Only the keys present in `payload` are sent, because SliceWP treats an
 * omitted field as "leave alone" but an empty string as "clear it".
 */
export async function updateSliceWPAffiliate(
  slicewpAffiliateId: number,
  payload: AffiliateWritePayload
): Promise<SliceWPAffiliate> {
  if (Object.keys(payload).length === 0) {
    throw new Error("No changes to write.");
  }

  return slicewpWrite<SliceWPAffiliate>(
    `/affiliates/${slicewpAffiliateId}`,
    "PUT",
    payload
  );
}

/**
 * Whether writes are currently permitted, for surfacing the guard in the UI
 * before the admin fills out a form rather than after they submit it.
 */
export async function canWriteToStore(): Promise<{
  writable: boolean;
  storeUrl: string;
  reason?: string;
}> {
  const settings = await getSettings();

  try {
    assertWritableStore(settings.wcStoreUrl);
    return { writable: true, storeUrl: settings.wcStoreUrl };
  } catch (error) {
    return {
      writable: false,
      storeUrl: settings.wcStoreUrl,
      reason: error instanceof Error ? error.message : "Writes are blocked.",
    };
  }
}
