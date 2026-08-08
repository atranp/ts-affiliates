"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type DialogOverlayProps = {
  open: boolean;
  label: string;
  children: ReactNode;
  /** Omit to make the dialog dismissable only through its own controls. */
  onDismiss?: () => void;
};

/**
 * Renders into document.body so overlays escape the stacking context created by
 * the sticky page sidebars — otherwise the nav and sticky headers paint on top.
 */
export function DialogOverlay({
  open,
  label,
  children,
  onDismiss,
}: DialogOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !onDismiss) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss!();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onDismiss]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto overscroll-contain p-4"
    >
      {onDismiss ? (
        <button
          type="button"
          className="absolute inset-0 h-full w-full cursor-default bg-foreground/30 backdrop-blur-sm"
          aria-label="Close dialog"
          onClick={onDismiss}
        />
      ) : (
        <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" />
      )}
      <div className="relative z-10 my-auto w-full max-w-md">{children}</div>
    </div>,
    document.body
  );
}
