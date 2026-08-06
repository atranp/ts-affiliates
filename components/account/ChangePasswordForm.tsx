"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/AuthProvider";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import {
  canSubmitChangePassword,
  MIN_PASSWORD_LENGTH,
  passwordRequirementMet,
  passwordsMatch,
  validateChangePasswordFields,
  type ChangePasswordField,
  type ChangePasswordFieldErrors,
} from "@/lib/account/change-password-validation";
import { cn } from "@/lib/utils";

const fieldClassName =
  "h-11 rounded-lg text-base sm:h-9 sm:text-sm";

type PasswordInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  autoComplete: "new-password";
  enterKeyHint?: "next" | "go";
  disabled: boolean;
  error?: string;
  describedBy?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
};

function PasswordInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  autoComplete,
  enterKeyHint = "next",
  disabled,
  error,
  describedBy,
  inputRef,
}: PasswordInputProps) {
  const errorId = `${id}-error`;
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold sm:text-sm">
        {label}
      </Label>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          id={id}
          name={id}
          type={showPassword ? "text" : "password"}
          enterKeyHint={enterKeyHint}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={cn(fieldClassName, "pl-9 pr-12", error && "border-destructive")}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={
            [error ? errorId : null, describedBy].filter(Boolean).join(" ") ||
            undefined
          }
          required
          minLength={MIN_PASSWORD_LENGTH}
        />
        <button
          type="button"
          onClick={() => setShowPassword((shown) => !shown)}
          disabled={disabled}
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-xs leading-snug text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function RequirementRow({
  met,
  label,
}: {
  met: boolean;
  label: string;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-2 text-xs leading-snug transition-colors",
        met ? "text-success" : "text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          met
            ? "border-success/30 bg-success/10 text-success"
            : "border-border bg-muted/50 text-transparent"
        )}
        aria-hidden
      >
        <Check className="h-2.5 w-2.5" />
      </span>
      <span>{label}</span>
    </li>
  );
}

type ChangePasswordFormProps = {
  required?: boolean;
};

export function ChangePasswordForm({ required = false }: ChangePasswordFormProps) {
  const router = useRouter();
  const { refresh } = useAuth();
  const formErrorId = useId();
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ChangePasswordFieldErrors>({});
  const [touched, setTouched] = useState<
    Partial<Record<ChangePasswordField, boolean>>
  >({});

  const copy = AFFILIATE_COPY.account.changePassword;
  const canSubmit = canSubmitChangePassword(password, confirm, loading);
  const lengthMet = passwordRequirementMet(password);
  const matchMet = passwordsMatch(password, confirm);

  useEffect(() => {
    if (formError) {
      formErrorRef.current?.focus();
    }
  }, [formError]);

  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) {
      passwordRef.current?.focus();
    }
  }, []);

  function clearFormError() {
    if (formError) setFormError("");
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    clearFormError();
    if (touched.password) {
      setFieldErrors((prev) => ({
        ...prev,
        ...validateChangePasswordFields(value, confirm, {
          requireConfirm: !!touched.confirm,
        }),
      }));
    }
  }

  function handleConfirmChange(value: string) {
    setConfirm(value);
    clearFormError();
    if (touched.confirm) {
      setFieldErrors((prev) => ({
        ...prev,
        ...validateChangePasswordFields(password, value, {
          requireConfirm: true,
        }),
      }));
    }
  }

  function markTouched(field: ChangePasswordField) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setFieldErrors((prev) => ({
      ...prev,
      ...validateChangePasswordFields(password, confirm, {
        requireConfirm: field === "confirm" || !!touched.confirm,
      }),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const nextErrors = validateChangePasswordFields(password, confirm, {
      requireConfirm: true,
    });

    if (password.length < MIN_PASSWORD_LENGTH) {
      nextErrors.password = `Must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    if (confirm.length < MIN_PASSWORD_LENGTH) {
      nextErrors.confirm = `Must be at least ${MIN_PASSWORD_LENGTH} characters`;
    } else if (password !== confirm) {
      nextErrors.confirm = "Passwords do not match";
    }

    setTouched({ password: true, confirm: true });
    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setLoading(true);
    setFormError("");

    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? copy.errors.updateFailed);
      }

      toast.success(copy.success);
      await refresh();
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : copy.errors.updateFailed
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      method="post"
      className="space-y-5"
      aria-labelledby="change-password-heading"
      noValidate
    >
      <PasswordInput
        id="password"
        label={copy.fields.password}
        value={password}
        onChange={handlePasswordChange}
        onBlur={() => markTouched("password")}
        autoComplete="new-password"
        enterKeyHint="next"
        disabled={loading}
        error={touched.password ? fieldErrors.password : undefined}
        describedBy="password-requirements"
        inputRef={passwordRef}
      />

      <PasswordInput
        id="confirm"
        label={copy.fields.confirm}
        value={confirm}
        onChange={handleConfirmChange}
        onBlur={() => markTouched("confirm")}
        autoComplete="new-password"
        enterKeyHint="go"
        disabled={loading}
        error={touched.confirm ? fieldErrors.confirm : undefined}
      />

      <ul
        id="password-requirements"
        className="space-y-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
        aria-live="polite"
      >
        <RequirementRow
          met={lengthMet}
          label={copy.requirements.length(MIN_PASSWORD_LENGTH)}
        />
        <RequirementRow met={matchMet} label={copy.requirements.match} />
      </ul>

      {formError && (
        <p
          ref={formErrorRef}
          id={formErrorId}
          role="alert"
          tabIndex={-1}
          className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm leading-snug text-destructive"
        >
          {formError}
        </p>
      )}

      <Button
        type="submit"
        className="h-11 w-full rounded-lg border border-brand-dark py-2.5 text-sm font-semibold shadow-sm sm:h-9 sm:text-xs"
        disabled={!canSubmit}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {copy.submitting}
          </>
        ) : (
          <>
            {required ? copy.submitRequired : copy.submit}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </Button>
    </form>
  );
}
