import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Asserts the environment guards still fire for the combinations they exist to
 * prevent, by evaluating them against synthetic store/database pairs rather
 * than the one currently configured.
 *
 * Worth having as a script because the guards are only ever exercised by
 * accident otherwise — the whole point is that the dangerous configuration is
 * one nobody sets deliberately.
 *
 * Usage: npx tsx scripts/dev-guard-check.ts
 */

const PROD_STORE = "https://true-sciences.com";
const LOCAL_STORE = "https://true-sciences-04.local";
const PROD_DB = "postgresql://postgres.oeeitumsfwcdmzborssc@example/postgres";
const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

type Case = {
  name: string;
  store: string;
  database: string;
  vercel: boolean;
  expect: "blocked" | "allowed";
};

const CASES: Case[] = [
  {
    name: "write to production store from a local machine",
    store: PROD_STORE,
    database: PROD_DB,
    vercel: false,
    expect: "blocked",
  },
  {
    name: "write to Local WordPress",
    store: LOCAL_STORE,
    database: LOCAL_DB,
    vercel: false,
    expect: "allowed",
  },
  {
    name: "sync Local WordPress into the production database",
    store: LOCAL_STORE,
    database: PROD_DB,
    vercel: false,
    expect: "blocked",
  },
  {
    name: "sync Local WordPress into the local database (Mode C)",
    store: LOCAL_STORE,
    database: LOCAL_DB,
    vercel: false,
    expect: "allowed",
  },
  {
    name: "mutate production auth from a local machine",
    store: LOCAL_STORE,
    database: PROD_DB,
    vercel: false,
    expect: "blocked",
  },
  {
    name: "mutate auth on the local stack",
    store: LOCAL_STORE,
    database: LOCAL_DB,
    vercel: false,
    expect: "allowed",
  },
];

async function main() {
  const guard = await import("../lib/env-guard");

  const originalDb = process.env.DATABASE_URL;
  const originalSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalVercel = process.env.VERCEL;
  const originalOverride = process.env.ALLOW_PRODUCTION_WRITES;

  // The override would mask every failure below, and it is plausibly left set
  // in a shell from an earlier deliberate production write.
  delete process.env.ALLOW_PRODUCTION_WRITES;

  let failures = 0;

  for (const testCase of CASES) {
    process.env.DATABASE_URL = testCase.database;
    process.env.NEXT_PUBLIC_SUPABASE_URL = testCase.database;

    if (testCase.vercel) {
      process.env.VERCEL = "1";
    } else {
      delete process.env.VERCEL;
    }

    let blocked = false;

    try {
      if (testCase.name.includes("auth")) {
        guard.assertWritableAuth();
      } else if (testCase.name.includes("sync")) {
        guard.assertSyncTargetsAgree(testCase.store);
      } else {
        guard.assertWritableStore(testCase.store);
      }
    } catch {
      blocked = true;
    }

    const actual = blocked ? "blocked" : "allowed";
    const ok = actual === testCase.expect;
    if (!ok) failures += 1;

    console.log(
      `${ok ? "pass" : "FAIL"}  ${testCase.name}\n      expected ${testCase.expect}, got ${actual}`
    );
  }

  process.env.DATABASE_URL = originalDb;
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabase;
  if (originalVercel !== undefined) process.env.VERCEL = originalVercel;
  if (originalOverride !== undefined) {
    process.env.ALLOW_PRODUCTION_WRITES = originalOverride;
  }

  console.log(
    `\n${CASES.length - failures}/${CASES.length} guard cases behaved as expected.`
  );

  if (failures > 0) {
    throw new Error(`${failures} guard case(s) regressed.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
