import { readFileSync } from "node:fs";

/**
 * Resolves the production Supabase values out of `.env.local` even when that
 * file is in Mode C and the production lines are commented out.
 *
 * Exists because the production values and the local ones live in the same
 * file under the same keys, so "read the env var" silently yields whichever
 * mode is active. Selecting by project ref makes the target explicit instead.
 */

export const PRODUCTION_SUPABASE_REF =
  process.env.PRODUCTION_SUPABASE_REF ?? "oeeitumsfwcdmzborssc";

const ENV_FILE = ".env.local";

/** Every value for a key, whether the line is active or commented out. */
export function envCandidates(key: string, file = ENV_FILE): string[] {
  const text = readFileSync(file, "utf8");
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

function requireValue(key: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Could not find a production value for ${key} in ${ENV_FILE}. ` +
        "Expected an active or commented line naming project " +
        PRODUCTION_SUPABASE_REF
    );
  }
  return value;
}

export function prodSupabaseUrl(): string {
  return requireValue(
    "NEXT_PUBLIC_SUPABASE_URL",
    envCandidates("NEXT_PUBLIC_SUPABASE_URL").find((v) =>
      v.includes(`${PRODUCTION_SUPABASE_REF}.supabase.co`)
    )
  );
}

export function prodServiceRoleKey(): string {
  return requireValue(
    "SUPABASE_SERVICE_ROLE_KEY",
    envCandidates("SUPABASE_SERVICE_ROLE_KEY").find(
      (v) => jwtRef(v) === PRODUCTION_SUPABASE_REF
    )
  );
}

export function prodDatabaseUrl(): string {
  return requireValue(
    "DATABASE_URL",
    envCandidates("DATABASE_URL").find((v) =>
      v.includes(PRODUCTION_SUPABASE_REF)
    )
  );
}

export function prodDirectUrl(): string {
  return (
    envCandidates("DIRECT_URL").find((v) =>
      v.includes(PRODUCTION_SUPABASE_REF)
    ) ?? prodDatabaseUrl()
  );
}
