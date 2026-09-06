import { config } from "dotenv";
import { randomInt } from "node:crypto";
import { Role } from "@prisma/client";

config({ path: ".env" });
config({ path: ".env.local", override: true });

if (process.env.BACKFILL_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.BACKFILL_DATABASE_URL;
  process.env.DIRECT_URL =
    process.env.BACKFILL_DIRECT_URL ?? process.env.BACKFILL_DATABASE_URL;
}

/**
 * Create pilot affiliate portal logins with known temp passwords for internal QA.
 *
 * Sets mustChangePassword=false for internal QA (full dashboard immediately).
 * Before handing credentials to Blair/Trin/Emmie, run Admin → Reset password
 * or re-bootstrap with --force-change-on-login.
 *
 * Usage:
 *   ALLOW_PRODUCTION_WRITES=true npx tsx scripts/bootstrap-pilot-affiliate.ts --dry-run
 *   ALLOW_PRODUCTION_WRITES=true npx tsx scripts/bootstrap-pilot-affiliate.ts --apply
 *   ... --apply --name=Blair --password='YourTempPass123'
 */

const PILOT_MATCHERS = ["Blair", "Trin", "Emmie"] as const;

const PASSWORD_ALPHABET =
  "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function parseArgs() {
  const apply = process.argv.includes("--apply");
  const nameArg = process.argv.find((a) => a.startsWith("--name="));
  const passwordArg = process.argv.find((a) => a.startsWith("--password="));
  const forceChangeOnLogin = process.argv.includes("--force-change-on-login");
  return {
    dryRun: !apply,
    nameFilter: nameArg?.split("=")[1]?.trim(),
    fixedPassword: passwordArg?.split("=")[1],
    mustChangePassword: forceChangeOnLogin,
  };
}

function tempPassword(length = 16): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return result;
}

async function findAuthUserIdByEmail(
  listUsers: (page: number) => Promise<{
    data?: { users: Array<{ id: string; email?: string }> };
  }>,
  email: string
): Promise<string | null> {
  const normalized = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data } = await listUsers(page);
    const match = data?.users.find(
      (user) => user.email?.toLowerCase() === normalized
    );
    if (match) return match.id;
    if (!data?.users.length) break;
  }
  return null;
}

async function main() {
  const { dryRun, nameFilter, fixedPassword, mustChangePassword } = parseArgs();
  const { isProductionDatabase } = await import("../lib/env-guard");

  if (!isProductionDatabase()) {
    throw new Error("Refusing: DATABASE_URL is not production.");
  }

  if (!dryRun) {
    process.env.ALLOW_PRODUCTION_WRITES = "true";
  }

  const { createAdminClient } = await import("../lib/supabase/admin");
  const { prisma } = await import("../lib/prisma");
  const { ensureAuthRoleConsistency } = await import("../lib/auth-role");
  const { linkProfileToAffiliateByEmail } = await import("../lib/sync");

  const supabase = createAdminClient();
  const loginUrl = "https://ts-affiliates.vercel.app/login";

  const affiliates = await prisma.affiliate.findMany({
    where: {
      AND: [
        { status: "ACTIVE" },
        nameFilter
          ? { displayName: { contains: nameFilter, mode: "insensitive" } }
          : {
              OR: PILOT_MATCHERS.map((name) => ({
                displayName: { contains: name, mode: "insensitive" as const },
              })),
            },
      ],
    },
    select: {
      id: true,
      displayName: true,
      email: true,
      slicewpId: true,
      profile: { select: { id: true } },
    },
    orderBy: { displayName: "asc" },
  });

  if (affiliates.length === 0) {
    throw new Error("No matching active affiliates found.");
  }

  if (!nameFilter && affiliates.length > 3) {
    console.warn(
      `Warning: ${affiliates.length} matches — narrow with --name= if needed.\n`
    );
  }

  console.log(dryRun ? "DRY RUN\n" : "APPLY\n");

  const credentials: Array<{
    name: string;
    email: string;
    password: string;
    affiliateId: string;
  }> = [];

  for (const affiliate of affiliates) {
    const email = affiliate.email.trim().toLowerCase();
    const displayName = affiliate.displayName?.trim() || email;
    const password = fixedPassword ?? tempPassword(16);

    console.log(`── ${displayName} <${email}> ──`);

    if (dryRun) {
      console.log(
        affiliate.profile
          ? `  profile exists (${affiliate.profile.id})`
          : "  no portal profile yet"
      );
      continue;
    }

    let authUserId = await findAuthUserIdByEmail(
      (page) => supabase.auth.admin.listUsers({ page, perPage: 200 }),
      email
    );

    const existingProfileId = affiliate.profile?.id ?? null;

    if (existingProfileId && authUserId && authUserId !== existingProfileId) {
      console.log(
        `  removing orphan auth user ${authUserId} (profile is ${existingProfileId})`
      );
      await supabase.auth.admin.deleteUser(authUserId);
      authUserId = null;
    }

    let userId = authUserId;

    const authPayload = {
      password,
      email,
      email_confirm: true,
      app_metadata: { role: Role.AFFILIATE },
      user_metadata: { name: displayName },
    };

    if (userId) {
      const updated = await supabase.auth.admin.updateUserById(userId, authPayload);
      if (updated.error) {
        if (updated.error.message.toLowerCase().includes("not found")) {
          console.log(`  auth user ${userId} missing — will recreate`);
          userId = null;
        } else {
          throw new Error(`updateUser ${userId}: ${updated.error.message}`);
        }
      } else {
        console.log(`  updated auth user ${userId}`);
      }
    }

    if (!userId && existingProfileId) {
      const created = await supabase.auth.admin.createUser({
        id: existingProfileId,
        ...authPayload,
      });
      if (created.error || !created.data.user) {
        throw new Error(
          `recreate auth for profile ${existingProfileId}: ${created.error?.message ?? "unknown"}`
        );
      }
      userId = created.data.user.id;
      console.log(`  recreated auth user ${userId} for existing profile`);
    }

    if (!userId) {
      const created = await supabase.auth.admin.createUser(authPayload);
      if (created.error || !created.data.user) {
        throw new Error(
          `createUser: ${created.error?.message ?? "unknown error"}`
        );
      }
      userId = created.data.user.id;
      console.log(`  created auth user ${userId}`);
    }

    await prisma.profile.upsert({
      where: { id: userId },
      update: {
        email,
        name: displayName,
        role: Role.AFFILIATE,
        affiliateId: affiliate.id,
        mustChangePassword,
        portalDisabledAt: null,
      },
      create: {
        id: userId,
        email,
        name: displayName,
        role: Role.AFFILIATE,
        affiliateId: affiliate.id,
        mustChangePassword,
      },
    });

    await linkProfileToAffiliateByEmail(userId, email);
    await ensureAuthRoleConsistency(userId, Role.AFFILIATE);

    credentials.push({
      name: displayName,
      email,
      password,
      affiliateId: affiliate.id,
    });

    console.log(`  profile linked affiliateId=${affiliate.id}`);
    console.log(`  mustChangePassword=${mustChangePassword}\n`);
  }

  if (credentials.length > 0) {
    console.log("═══════════════════════════════════════════════════");
    console.log("Pilot login credentials (internal QA only — do not Slack)");
    console.log(`Sign in: ${loginUrl}\n`);

    for (const row of credentials) {
      console.log(`${row.name}`);
      console.log(`  Email:    ${row.email}`);
      console.log(`  Password: ${row.password}`);
      console.log(
        `  Note:     mustChangePassword=${mustChangePassword}\n`
      );
    }

    console.log(
      "After QA: re-run with new passwords before handing to affiliates,"
    );
    console.log("or use Admin → Reset password for one-time links.");
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
