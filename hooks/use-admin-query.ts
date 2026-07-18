"use client";

import useSWR, { type SWRConfiguration } from "swr";

async function adminFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? "Request failed");
  }
  return body as T;
}

export function useAdminQuery<T>(
  key: string | null,
  config?: SWRConfiguration<T>
) {
  return useSWR<T>(key, adminFetcher, {
    revalidateOnFocus: false,
    ...config,
  });
}

export async function adminMutate<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, options);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error ?? "Request failed");
  }
  return body as T;
}
