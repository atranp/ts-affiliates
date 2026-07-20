import { createClient } from "@supabase/supabase-js";

function ensureWebSocketPolyfill() {
  if (typeof globalThis.WebSocket !== "undefined") return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ws = require("ws") as typeof import("ws");
    globalThis.WebSocket = ws.WebSocket as unknown as typeof WebSocket;
  } catch {
    // Node 22+ provides WebSocket natively
  }
}

export function createAdminClient() {
  ensureWebSocketPolyfill();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
