import { config } from "dotenv";
import { readFileSync, existsSync } from "fs";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Works out which secret the production credentials were actually encrypted
 * with. `lib/encryption.getKey()` falls back to SUPABASE_SERVICE_ROLE_KEY when
 * ENCRYPTION_SECRET is unset, so a value saved before that variable existed on
 * Vercel is encrypted with the service role key instead.
 *
 * Prints candidate labels only — never key material.
 *
 * Usage: npx tsx scripts/m6-which-key.ts "<prod DIRECT_URL>"
 */

const url = process.argv[2];

if (!url || !/supabase\.c/.test(url)) {
  console.error("Pass the production DIRECT_URL as the first argument.");
  process.exit(1);
}

function readVar(file: string, name: string): string | null {
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(new RegExp(`^${name}=(.*)$`));
    if (match) return match[1].trim().replace(/^"|"$/g, "");
  }
  return null;
}

function tryDecrypt(ciphertext: string, secret: string): string | null {
  try {
    const key = crypto.createHash("sha256").update(secret).digest();
    const data = Buffer.from(ciphertext, "base64");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      data.subarray(0, 12)
    );
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
    select: { wcStoreUrlEncrypted: true },
  });

  const sample = settings?.wcStoreUrlEncrypted;
  if (!sample) throw new Error("No encrypted store URL on the settings row.");

  const candidates: Array<[label: string, secret: string | null]> = [
    ["vercel  ENCRYPTION_SECRET", readVar(".env.vercel-prod", "ENCRYPTION_SECRET")],
    [
      "vercel  SUPABASE_SERVICE_ROLE_KEY",
      readVar(".env.vercel-prod", "SUPABASE_SERVICE_ROLE_KEY"),
    ],
    ["local   ENCRYPTION_SECRET", readVar(".env.local", "ENCRYPTION_SECRET")],
    [
      "local   SUPABASE_SERVICE_ROLE_KEY",
      readVar(".env.local", "SUPABASE_SERVICE_ROLE_KEY"),
    ],
  ];

  console.log("\ntesting which secret decrypts the production settings row:\n");

  let winner: string | null = null;

  for (const [label, secret] of candidates) {
    if (!secret) {
      console.log(`  n/a      ${label}  (not present)`);
      continue;
    }
    const plain = tryDecrypt(sample, secret);
    if (plain) {
      console.log(`  WORKS    ${label}  → decrypts to ${plain}`);
      winner ??= label;
    } else {
      console.log(`  no       ${label}`);
    }
  }

  if (!winner) {
    console.log(
      "\nNone worked. The credentials were encrypted with a value not in either file."
    );
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
