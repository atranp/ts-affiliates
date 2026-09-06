import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

// Node 20 has no global WebSocket; supabase-js expects one.
if (typeof globalThis.WebSocket === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ws = require("ws") as typeof import("ws");
  globalThis.WebSocket = ws.WebSocket as unknown as typeof WebSocket;
}

/**
 * Read-only. Reports which portal logins actually exist in the *production*
 * Supabase auth project, versus what the production database believes.
 *
 * Reads the production Supabase values even when `.env.local` is in Mode C,
 * because the whole point is to check the project the deployed app uses rather
 * than whichever one happens to be active locally.
 */

const EMAILS = [
  "anthony@true-sciences.com",
  "gavin@true-sciences.com",
  "stone@true-sciences.com",
  "blair@blairswish.com",
  "emmiepayton1@gmail.com",
  "trindalyn.mackenzie11@gmail.com",
];

const PROD_REF = "oeeitumsfwcdmzborssc";

/** Every value for a key, whether the line is active or commented out. */
function candidates(key: string): string[] {
  const text = readFileSync(".env.local", "utf8");
  const pattern = new RegExp(
    `^\\s*#?\\s*${key}\\s*=\\s*"?([^"\\r\\n]+)"?\\s*$`,
    "gm"
  );
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    values.push(match[1]!.trim());
  }
  return values;
}

/** A Supabase JWT carries its project ref in the payload, so keys self-identify. */
function jwtRef(token: string): string | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { ref?: string };
    return json.ref ?? null;
  } catch {
    return null;
  }
}

function prodUrl(key: string): string | null {
  return candidates(key).find((v) => v.includes(`${PROD_REF}.supabase.co`)) ?? null;
}

function prodKey(key: string): string | null {
  return candidates(key).find((v) => jwtRef(v) === PROD_REF) ?? null;
}

async function main() {
  const url = prodUrl("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = prodKey("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !url.includes("supabase.co")) {
    throw new Error("Could not find a production Supabase URL in .env.local");
  }
  if (!serviceKey) {
    throw new Error("Could not find a service role key in .env.local");
  }

  console.log(`prod supabase: ${new URL(url).host}\n`);

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const found = new Map<string, { id: string; role?: string }>();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const user of data.users) {
      const email = user.email?.toLowerCase();
      if (email && EMAILS.includes(email)) {
        found.set(email, {
          id: user.id,
          role: (user.app_metadata as { role?: string })?.role,
        });
      }
    }
    if (!data.users.length) break;
  }

  console.log("── production Supabase auth ──");
  for (const email of EMAILS) {
    const hit = found.get(email);
    console.log(
      `  ${hit ? "EXISTS " : "MISSING"}  ${email}${hit ? `  id=${hit.id} role=${hit.role ?? "—"}` : ""}`
    );
  }

  // What the production database believes about the same people.
  const prodDbUrl = candidates("DATABASE_URL").find((v) =>
    v.includes("supabase.co")
  );
  if (prodDbUrl?.includes("supabase.co")) {
    process.env.DATABASE_URL = prodDbUrl;
    process.env.DIRECT_URL = prodDbUrl;
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({
      datasources: { db: { url: prodDbUrl } },
    });

    console.log("\n── production database Profile rows ──");
    for (const email of EMAILS) {
      const profile = await prisma.profile.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true, role: true, mustChangePassword: true },
      });
      const authId = found.get(email)?.id;
      const state = !profile
        ? "no profile"
        : authId === undefined
          ? "PROFILE WITHOUT AUTH USER"
          : authId === profile.id
            ? "linked ok"
            : "ID MISMATCH vs auth";
      console.log(
        `  ${email}: ${state}${profile ? ` role=${profile.role} mustChange=${profile.mustChangePassword} id=${profile.id}` : ""}`
      );
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
