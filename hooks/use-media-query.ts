"use client";

import { useEffect, useState } from "react";

export function useMinWidth(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export function useMinLg(): boolean {
  return useMinWidth("(min-width: 1024px)");
}
