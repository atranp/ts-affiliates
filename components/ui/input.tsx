import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        // 16px on a phone is not a style choice: iOS Safari zooms the page when
        // a focused field is smaller, and the viewport sets no maximum-scale
        // (deliberately — capping zoom breaks pinch for low-vision users). The
        // taller mobile box also clears Apple's 44pt touch minimum.
        "flex h-11 w-full rounded-lg border border-input bg-card px-3 py-1 text-base text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
