"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Last resort — replaces the root layout, so it cannot use Providers, fonts or
 * shared components. Only fires when the root layout itself throws.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-[100dvh] antialiased">
        <div className="flex min-h-[100dvh] items-center justify-center bg-white px-4 py-8">
          <main className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              True Sciences
            </p>
            <h1 className="mt-2 text-xl font-bold text-gray-900">
              The portal is temporarily unavailable
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Please try again in a moment. Your commission and payout records
              are unaffected.
            </p>

            {error.digest && (
              <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 font-mono text-[11px] text-gray-500">
                Reference: {error.digest}
              </p>
            )}

            <button
              type="button"
              onClick={reset}
              className="mt-5 h-11 w-full rounded-lg bg-gray-900 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
            >
              Try again
            </button>
          </main>
        </div>
      </body>
    </html>
  );
}
