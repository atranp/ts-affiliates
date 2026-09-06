import {
  prodDatabaseUrl,
  prodDirectUrl,
  prodServiceRoleKey,
  prodSupabaseUrl,
} from "./prod-env";

/**
 * Runs a bootstrap script against production Postgres *and* production Supabase
 * Auth, without editing `.env.local` and without any secret being typed into a
 * shell or printed.
 *
 * The two targets are separate env vars, so overriding only the database is the
 * one mistake that produces profiles pointing at users which do not exist.
 * Setting both from one place removes that possibility.
 *
 * Usage:
 *   npx tsx scripts/with-prod-supabase.ts scripts/bootstrap-prod-admin.ts --apply
 *   npx tsx scripts/with-prod-supabase.ts scripts/bootstrap-pilot-affiliate.ts --dry-run
 */

async function main() {
  const [target, ...forwarded] = process.argv.slice(2);

  if (!target) {
    throw new Error(
      "Pass the script to run, e.g. scripts/bootstrap-prod-admin.ts --apply"
    );
  }

  const supabaseUrl = prodSupabaseUrl();

  process.env.BACKFILL_DATABASE_URL = prodDatabaseUrl();
  process.env.BACKFILL_DIRECT_URL = prodDirectUrl();
  process.env.BACKFILL_SUPABASE_URL = supabaseUrl;
  process.env.BACKFILL_SUPABASE_SERVICE_ROLE_KEY = prodServiceRoleKey();

  console.log(`target script:  ${target}`);
  console.log(`supabase auth:  ${new URL(supabaseUrl).host}`);
  console.log(`database:       ${new URL(process.env.BACKFILL_DATABASE_URL).host}\n`);

  // The target reads process.argv directly, so present it the argv it expects.
  process.argv = [process.argv[0]!, target, ...forwarded];

  const path = target.startsWith("scripts/")
    ? `./${target.slice("scripts/".length)}`
    : target;

  await import(path.replace(/\.ts$/, ""));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
