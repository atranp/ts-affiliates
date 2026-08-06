export const MIN_PASSWORD_LENGTH = 8;

export type ChangePasswordField = "password" | "confirm";

export type ChangePasswordFieldErrors = Partial<
  Record<ChangePasswordField, string>
>;

export function validateChangePasswordFields(
  password: string,
  confirm: string,
  { requireConfirm = false }: { requireConfirm?: boolean } = {}
): ChangePasswordFieldErrors {
  const errors: ChangePasswordFieldErrors = {};

  if (password.length > 0 && password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Must be at least ${MIN_PASSWORD_LENGTH} characters`;
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
  loading: boolean
): boolean {
  if (loading) return false;
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    confirm.length >= MIN_PASSWORD_LENGTH &&
    password === confirm
  );
}

export function passwordRequirementMet(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

export function passwordsMatch(password: string, confirm: string): boolean {
  return confirm.length > 0 && password === confirm;
}
