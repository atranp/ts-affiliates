"use client";

import { useEffect, useRef } from "react";
import { startSync } from "@/hooks/use-sync-status";

/** Kicks off a background sync when admin data is stale (>6h). Runs once per session. */
export function SyncAutoStart() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    startSync({ auto: true }).catch(() => {
      // silent — cron or manual sync can cover failures
    });
  }, []);

  return null;
}
