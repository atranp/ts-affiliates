import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Exercises the one-time link that replaced the emailed temporary password.
 *
 * The hazards here are all "does the credential actually stop working" — a
 * question a mocked Supabase would answer by construction and therefore prove
 * nothing about. So this runs against the local Supabase stack (Mode C) and a
 * cohort affiliate, and redeems real tokens.
 *
 * Requires `supabase start` and Mode C in `.env.local`.
 *
 * Usage: npm run portal-link-smoke
 */

import { createClient } from "@supabase/supabase-js";
import { isCohortEmail } from "./cohort";

const checks: Array<{ name: string; ok: boolean }> = [];

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok });
  console.log(`${ok ? "pass" : "FAIL"}  ${name}\n      ${detail}`);
}

const ORIGIN = "http://localhost:3000";

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function parseLink(link: string) {
  const url = new URL(link);
  return {
    path: url.pathname,
    tokenHash: url.searchParams.get("token_hash"),
    type: url.searchParams.get("type"),
    next: url.searchParams.get("next"),
  };
}

async function main() {
  const { isProductionDatabase } = await import("../lib/env-guard");

  if (isProductionDatabase()) {
    throw new Error(
      "Refusing to run: DATABASE_URL points at production. Switch to Mode C."
    );
  }

  const { prisma } = await import("../lib/prisma");
  const { createAdminClient } = await import("../lib/supabase/admin");
  const {
    inviteAffiliateToPortal,
    resetAffiliatePortalPassword,
  } = await import("../lib/admin/affiliate-portal");

  const admin = createAdminClient();

  const affiliate = await prisma.affiliate.findFirst({
    where: { email: { startsWith: "ts-qa-" } },
  });

  if (!affiliate || !isCohortEmail(affiliate.email)) {
    throw new Error(
      "No cohort affiliate in the mirror. Run `npm run cohort seed` then `npm run sync:local`."
    );
  }

  const email = affiliate.email.toLowerCase();
  console.log(`affiliate:  ${affiliate.displayName ?? email} <${email}>\n`);

  /** Both ends of the test need the account gone so `invite` is reachable. */
  async function removeAccount() {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = data.users.find(
      (user) => user.email?.toLowerCase() === email
    );
    await prisma.profile.deleteMany({ where: { email } });
    if (existing) await admin.auth.admin.deleteUser(existing.id);
  }

  await removeAccount();

  // ---- invite ------------------------------------------------------------

  const invite = await inviteAffiliateToPortal(affiliate.id, undefined, ORIGIN);

  record(
    "invite returns a link and no password",
    !!invite.inviteLink && !("temporaryPassword" in invite),
    invite.inviteLink ? invite.inviteLink.slice(0, 72) + "..." : "no link"
  );

  const parsed = parseLink(invite.inviteLink!);

  record(
    "link points at the confirm route with an invite token",
    parsed.path === "/auth/confirm" &&
      parsed.type === "invite" &&
      !!parsed.tokenHash,
    `${parsed.path} type=${parsed.type} next=${parsed.next}`
  );

  record(
    "link origin honours the configured app URL",
    invite.inviteLink!.startsWith(ORIGIN),
    invite.inviteLink!.slice(0, 30)
  );

  const profile = await prisma.profile.findUnique({
    where: { id: invite.profileId },
    select: { mustChangePassword: true, affiliateId: true },
  });

  record(
    "profile is created, linked, and flagged to set a password",
    profile?.mustChangePassword === true &&
      profile.affiliateId === affiliate.id,
    `mustChangePassword=${profile?.mustChangePassword} affiliateId=${profile?.affiliateId === affiliate.id}`
  );

  record(
    "invite message carries the link, not a credential",
    invite.inviteMessage!.includes(invite.inviteLink!) &&
      !/password:/i.test(invite.inviteMessage!),
    invite.inviteMessage!.split("\n").slice(4, 6).join(" ").trim()
  );

  // ---- redemption --------------------------------------------------------

  const redeem = await anonClient().auth.verifyOtp({
    token_hash: parsed.tokenHash!,
    type: "invite",
  });

  record(
    "token redeems into a session",
    !redeem.error && !!redeem.data.session,
    redeem.error ? redeem.error.message : `user ${redeem.data.user?.id}`
  );

  const replay = await anonClient().auth.verifyOtp({
    token_hash: parsed.tokenHash!,
    type: "invite",
  });

  record(
    "the same token cannot be redeemed twice",
    !!replay.error,
    replay.error?.message ?? "second redemption unexpectedly succeeded"
  );

  // ---- re-issue retires the old password ---------------------------------

  const knownPassword = "correct-horse-battery-staple-1";

  await admin.auth.admin.updateUserById(invite.profileId, {
    password: knownPassword,
  });

  const beforeReissue = await anonClient().auth.signInWithPassword({
    email,
    password: knownPassword,
  });

  record(
    "a known password signs in before the link is re-issued",
    !beforeReissue.error,
    beforeReissue.error?.message ?? "signed in"
  );

  const reset = await resetAffiliatePortalPassword(
    affiliate.id,
    invite.profileId,
    ORIGIN
  );

  const afterReissue = await anonClient().auth.signInWithPassword({
    email,
    password: knownPassword,
  });

  record(
    "reset retires the previous password",
    !!afterReissue.error,
    afterReissue.error?.message ?? "old password still works"
  );

  const resetParsed = parseLink(reset.inviteLink!);

  record(
    "reset issues a recovery link",
    resetParsed.type === "recovery" && !!resetParsed.tokenHash,
    `type=${resetParsed.type}`
  );

  const recovered = await anonClient().auth.verifyOtp({
    token_hash: resetParsed.tokenHash!,
    type: "recovery",
  });

  record(
    "the recovery token redeems into a session",
    !recovered.error && !!recovered.data.session,
    recovered.error ? recovered.error.message : "session issued"
  );

  // ---- password rules ----------------------------------------------------

  const { describePasswordWeakness, MIN_PASSWORD_LENGTH } = await import(
    "../lib/account/change-password-validation"
  );

  const rules: Array<[label: string, candidate: string, shouldReject: boolean]> =
    [
      ["too short", "Short1!", true],
      ["one repeated character", "aaaaaaaaaaaaaa", true],
      ["sequential run", "myabcdefgpass", true],
      ["contains the email local part", `${email.split("@")[0]}-portal`, true],
      ["contains a predictable term", "mypasswordisgood", true],
      ["long unrelated words", "copper-lantern-quiet-fig", false],
    ];

  const ruleResults = rules.map(([label, candidate, shouldReject]) => {
    const weakness = describePasswordWeakness(candidate, { email });
    return { label, ok: shouldReject === (weakness !== null), weakness };
  });

  record(
    `password rules hold at a ${MIN_PASSWORD_LENGTH}-character floor`,
    ruleResults.every((result) => result.ok),
    ruleResults
      .map((r) => `${r.ok ? "ok" : "WRONG"} ${r.label}`)
      .join(", ")
  );

  // ---- garbage -----------------------------------------------------------

  const forged = await anonClient().auth.verifyOtp({
    token_hash: "not-a-real-token-hash",
    type: "invite",
  });

  record(
    "a forged token is refused",
    !!forged.error,
    forged.error?.message ?? "forged token accepted"
  );

  await removeAccount();

  const passed = checks.filter((check) => check.ok).length;
  console.log(`\n${passed}/${checks.length} checks passed.`);

  await prisma.$disconnect();

  if (passed !== checks.length) process.exit(1);
}

main().catch(async (error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
