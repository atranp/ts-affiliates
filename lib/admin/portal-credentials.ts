/**
 * Portal access is handed out as a one-time link, never as a password.
 *
 * The platform still sends no email: `generateLink()` only returns the token,
 * and an admin decides how to deliver it. See `lib/admin/affiliate-portal.ts`.
 */

export type PortalLinkKind = "invite" | "recovery";

/**
 * Wording only. The real expiry lives in Supabase under
 * Authentication → Email OTP expiration, which governs invite and recovery
 * links as well as OTPs. Changing this constant does not change when a link
 * stops working, so it has to be kept in step with the dashboard by hand.
 */
export const PORTAL_LINK_TTL_HOURS = Number(
  process.env.PORTAL_LINK_TTL_HOURS ?? 24
);

function configuredOrigin(): string | null {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionDomain) return `https://${productionDomain}`;

  return null;
}

/**
 * A link pointing at the wrong host is worse than no link at all — it hands the
 * token to whoever owns that host. Configured values therefore win over the
 * incoming request, so a forged `Host` header cannot aim an invite elsewhere.
 * The request origin is only a development convenience.
 */
export function resolveAppOrigin(requestOrigin?: string | null): string {
  return (
    configuredOrigin() ??
    requestOrigin?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

/**
 * Built here rather than using Supabase's `action_link`, which assumes the
 * implicit flow and breaks under PKCE. `/auth/confirm` redeems the token
 * server-side instead.
 */
export function buildPortalConfirmUrl(input: {
  origin: string;
  tokenHash: string;
  kind: PortalLinkKind;
  next?: string;
}): string {
  const params = new URLSearchParams({
    token_hash: input.tokenHash,
    type: input.kind,
  });

  if (input.next) params.set("next", input.next);

  return `${input.origin}/auth/confirm?${params.toString()}`;
}

export function buildPortalInviteMessage(input: {
  name: string;
  email: string;
  link: string;
  kind: PortalLinkKind;
}): string {
  const opening =
    input.kind === "invite"
      ? "Your True Sciences ambassador portal is ready."
      : "Here is a link to get back into your True Sciences ambassador portal.";

  return [
    `Hi ${input.name},`,
    "",
    opening,
    "",
    "Choose your password here:",
    input.link,
    "",
    `The link can be used once and expires in ${PORTAL_LINK_TTL_HOURS} hours.`,
    "Ask us for a new one if it runs out.",
    "",
    `After that you'll sign in with ${input.email} and the password you chose.`,
  ].join("\n");
}
