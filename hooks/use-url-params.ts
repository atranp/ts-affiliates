"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type ParamUpdates = Record<string, string | null>;
export type SetParams = (
  updates: ParamUpdates,
  options?: { history?: boolean }
) => void;

/**
 * Treats the URL as the source of truth for view state so refreshes, the back
 * button, and shared links land where the user expects. A `null` value removes
 * the param. Pass `history: true` for navigations worth a back-button stop;
 * filter tweaks replace so they don't flood history.
 */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParams = useCallback<SetParams>(
    (updates, { history = false } = {}) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (history) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return { searchParams, setParams };
}
