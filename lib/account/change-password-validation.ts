/**
 * One source of truth for password rules, imported by both the form and
 * `POST /api/account/change-password`. They used to disagree: the form read
 * `MIN_PASSWORD_LENGTH` while the route hard-coded 8, so raising the constant
 * would have tightened the UI while leaving the endpoint accepting the old
 * minimum.
 *
 * Follows NIST SP 800-63B: a longer floor and screening beat composition rules,
 * which mostly push people toward predictable substitutions. So there is no
 * "one uppercase, one digit" requirement — just a real length and a check for
 * the shapes that clear a length rule while staying trivially guessable.
 *
 * Screening against known-breached passwords is Supabase's job — Authentication
 * → Password Security → leaked password protection. It cannot be done here
 * without shipping the breach list to the browser.
 */

export const MIN_PASSWORD_LENGTH = 12;

export type ChangePasswordField = "password" | "confirm";

export type ChangePasswordFieldErrors = Partial<
  Record<ChangePasswordField, string>
>;

export type PasswordContext = {
  /** Guessable from the account itself, so it cannot be the password. */
  email?: string | null;
};

/** Terms anyone attacking a True Sciences login would try first. */
const PREDICTABLE_TERMS = [
  "password",
  "truescience",
  "true-science",
  "ambassador",
  "affiliate",
  "letmein",
  "qwerty",
];

function isSingleRepeatedCharacter(value: string): boolean {
  return value.length > 0 && new Set(value).size === 1;
}

/** Catches `abcdef` and `123456` in either direction, anywhere in the string. */
function hasSequentialRun(value: string, runLength = 6): boolean {
  const lower = value.toLowerCase();

  for (let i = 0; i + runLength <= lower.length; i++) {
    let ascending = true;
    let descending = true;

    for (let offset = 1; offset < runLength; offset++) {
      const delta =
        lower.charCodeAt(i + offset) - lower.charCodeAt(i + offset - 1);
      if (delta !== 1) ascending = false;
      if (delta !== -1) descending = false;
    }

    if (ascending || descending) return true;
  }

  return false;
}

function emailLocalPart(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split("@")[0]?.trim().toLowerCase();
  return local && local.length >= 4 ? local : null;
}

/**
 * Returns a human-readable reason the password is unacceptable, or null when it
 * passes. Length is checked by the caller so an empty field does not read as an
 * error before anything is typed.
 */
export function describePasswordWeakness(
  password: string,
  context: PasswordContext = {}
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  if (isSingleRepeatedCharacter(password)) {
    return "Cannot be the same character repeated";
  }

  if (hasSequentialRun(password)) {
    return "Cannot contain a long run like abcdef or 123456";
  }

  const lower = password.toLowerCase();

  const local = emailLocalPart(context.email);
  if (local && lower.includes(local)) {
    return "Cannot contain your email address";
  }

  const term = PREDICTABLE_TERMS.find((candidate) => lower.includes(candidate));
  if (term) {
    return `Cannot contain "${term}"`;
  }

  return null;
}

export function validateChangePasswordFields(
  password: string,
  confirm: string,
  {
    requireConfirm = false,
    context = {},
  }: { requireConfirm?: boolean; context?: PasswordContext } = {}
): ChangePasswordFieldErrors {
  const errors: ChangePasswordFieldErrors = {};

  if (password.length > 0) {
    const weakness = describePasswordWeakness(password, context);
    if (weakness) errors.password = weakness;
  }

  if (requireConfirm || confirm.length > 0) {
    if (confirm.length < MIN_PASSWORD_LENGTH) {
      errors.confirm = `Must be at least ${MIN_PASSWORD_LENGTH} characters`;
    } else if (password !== confirm) {
      errors.confirm = "Passwords do not match";
    }
  }

  return errors;
}

export function canSubmitChangePassword(
  password: string,
  confirm: string,
  loading: boolean,
  context: PasswordContext = {}
): boolean {
  if (loading) return false;
  return (
    describePasswordWeakness(password, context) === null &&
    confirm.length >= MIN_PASSWORD_LENGTH &&
    password === confirm
  );
}

export function passwordRequirementMet(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

/** Length is shown as its own row, so this covers only the remaining checks. */
export function passwordStrengthMet(
  password: string,
  context: PasswordContext = {}
): boolean {
  if (password.length < MIN_PASSWORD_LENGTH) return false;
  return describePasswordWeakness(password, context) === null;
}

export function passwordsMatch(password: string, confirm: string): boolean {
  return confirm.length > 0 && password === confirm;
}
