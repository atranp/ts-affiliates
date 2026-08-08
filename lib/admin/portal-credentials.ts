import { randomInt } from "node:crypto";

/** Ambiguous glyphs (0/O, 1/l/I) are excluded so passwords survive being read aloud. */
const PASSWORD_ALPHABET =
  "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomPassword(length = 16): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  }
  return result;
}

function portalLoginUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  return `${base}/login`;
}

export function buildPortalInviteMessage(input: {
  name: string;
  email: string;
  temporaryPassword: string;
}): string {
  return [
    `Hi ${input.name},`,
    "",
    "Your True Sciences affiliate portal is ready.",
    "",
    `Login: ${portalLoginUrl()}`,
    `Email: ${input.email}`,
    `Temporary password: ${input.temporaryPassword}`,
    "",
    "Please sign in and change your password when prompted.",
  ].join("\n");
}
