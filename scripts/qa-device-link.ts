import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { prodServiceRoleKey, prodSupabaseUrl } from "./prod-env";
import { buildPortalConfirmUrl } from "../lib/admin/portal-credentials";

config({ path: ".env" });
config({ path: ".env.local", override: true });

// Node 20 has no global WebSocket; supabase-js expects one.
if (typeof globalThis.WebSocket === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ws = require("ws") as typeof import("ws");
  globalThis.WebSocket = ws.WebSocket as unknown as typeof WebSocket;
}

/**
 * Mints a single-use production sign-in link for QA on a real device.
 *
 * Exists because a simulator or phone cannot be driven through the login form
 * without granting Accessibility control of the machine, and because typing a
 * shared password on a device under test is a worse habit than a link that
 * expires. The link is written to a file rather than printed so it does not
 * linger in terminal scrollback.
 *
 * Usage:
 *   npx tsx scripts/qa-device-link.ts blair@blairswish.com /dashboard
 */

const APP_ORIGIN = "https://ts-affiliates.vercel.app";

async function main() {
  const [email, next = "/dashboard"] = process.argv.slice(2);

  if (!email) {
    throw new Error("Pass an email, e.g. blair@blairswish.com");
  }

  const supabase = createClient(prodSupabaseUrl(), prodServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    throw new Error(`generateLink failed: ${error?.message ?? "no token"}`);
  }

  const link = buildPortalConfirmUrl({
    origin: APP_ORIGIN,
    tokenHash,
    kind: "recovery",
    next,
  });

  const outputPath = "/tmp/qa-device-link.txt";
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(outputPath, link, "utf8")
  );

  console.log(`one-time link for ${email} -> ${next}`);
  console.log(`written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
