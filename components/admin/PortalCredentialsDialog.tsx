"use client";

import { useEffect, useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogOverlay } from "@/components/admin/DialogOverlay";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type PortalCredentials = {
  title: string;
  description: string;
  email: string;
  temporaryPassword: string;
  inviteMessage: string;
};

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Blocked on insecure origins or unfocused documents — try the legacy path.
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 select-all truncate rounded-md border border-border bg-muted px-2 py-1.5 font-mono text-sm">
          {value}
        </code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={async () => setCopied(await copyToClipboard(value))}
        >
          {copied ? (
            <Check className="h-4 w-4 text-success" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

type PortalCredentialsDialogProps = {
  credentials: PortalCredentials | null;
  onClose: () => void;
};

export function PortalCredentialsDialog({
  credentials,
  onClose,
}: PortalCredentialsDialogProps) {
  const [messageCopied, setMessageCopied] = useState(false);

  const inviteMessage = credentials?.inviteMessage;

  useEffect(() => {
    if (!inviteMessage) {
      setMessageCopied(false);
      return;
    }
    let active = true;
    void copyToClipboard(inviteMessage).then((ok) => {
      if (active) setMessageCopied(ok);
    });
    return () => {
      active = false;
    };
  }, [inviteMessage]);

  if (!credentials) return null;

  return (
    <DialogOverlay open label={credentials.title}>
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>{credentials.title}</CardTitle>
          <CardDescription className="leading-relaxed">
            {credentials.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs leading-relaxed text-foreground">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p>
              This password is shown once and is not stored anywhere. Copy it
              before closing — recovering it means resetting again.
            </p>
          </div>

          <CopyField label="Login email" value={credentials.email} />
          <CopyField
            label="Temporary password"
            value={credentials.temporaryPassword}
          />

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Invite message
            </p>
            <pre className="max-h-32 select-all overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted px-2 py-1.5 font-mono text-xs">
              {credentials.inviteMessage}
            </pre>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <p className="w-full text-xs text-muted-foreground">
            {messageCopied
              ? "Invite message copied to clipboard."
              : "Copy the invite message before closing."}
          </p>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={async () =>
                setMessageCopied(
                  await copyToClipboard(credentials.inviteMessage)
                )
              }
            >
              <Copy className="h-4 w-4" />
              Copy message
            </Button>
            <Button className="w-full sm:w-auto" onClick={onClose}>
              Done
            </Button>
          </div>
        </CardFooter>
      </Card>
    </DialogOverlay>
  );
}
