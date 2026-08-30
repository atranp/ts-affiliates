import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  applyMustChangePasswordCookie,
  applyRoleCookie,
  ensureAuthRoleConsistency,
} from "@/lib/auth-role";
import { homePathForRole, safeNextPath } from "@/lib/routes";

/**
 * Redeems the single-use links handed out by the admin portal panel.
 *
 * Supabase's own `action_link` is deliberately unused: it assumes the implicit
 * flow, which breaks under PKCE because the browser that generated the link is
 * not the one redeeming it. The token is exchanged here instead, server-side.
 */

const LINK_TYPES = ["invite", "recovery"] as const;

type LinkType = (typeof LINK_TYPES)[number];

function isLinkType(value: string | null): value is LinkType {
  return LINK_TYPES.includes(value as LinkType);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNextPath(searchParams.get("next"));

  const refuse = (reason: string) =>
    NextResponse.redirect(`${origin}/login?error=${reason}`);

  if (!tokenHash || !isLinkType(type)) {
    return refuse("link_invalid");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error || !data.user) {
    return refuse("link_expired");
  }

  const profile = await prisma.profile.findUnique({
    where: { id: data.user.id },
    select: { mustChangePassword: true, portalDisabledAt: true },
  });

  // The token proves control of the mailbox, not that access is still allowed.
  // A link minted before an account was disabled must not resurrect it.
  if (!profile) {
    await supabase.auth.signOut();
    return refuse("NO_PROFILE");
  }

  if (profile.portalDisabledAt) {
    await supabase.auth.signOut();
    return refuse("PORTAL_DISABLED");
  }

  const role = await ensureAuthRoleConsistency(
    data.user.id,
    data.user.app_metadata?.role as string | undefined
  );

  const destination = profile.mustChangePassword
    ? "/account/change-password"
    : next ?? homePathForRole(role ?? undefined);

  const response = NextResponse.redirect(`${origin}${destination}`);

  if (role) applyRoleCookie(response, role);
  applyMustChangePasswordCookie(response, profile.mustChangePassword);

  return response;
}
