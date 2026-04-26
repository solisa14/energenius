import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-12 w-full rounded-md border-[1.5px] border-border bg-surface px-4 text-base text-foreground placeholder:text-text-tertiary transition-all duration-150 focus-visible:outline-none focus-visible:border-accent-secondary focus-visible:ring-[3px] focus-visible:ring-accent-secondary/15 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
