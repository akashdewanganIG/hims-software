import * as React from "react";

import { cn } from "@/lib/utils";

export function PageShell({
  children,
  className,

  gap = "default",
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  gap?: "default" | "tight";
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className" | "children">) {
  return (
    <div
      {...props}
      className={cn(
        "mx-auto w-full max-w-[100rem] min-w-0",
        "px-4 pb-8 pt-5 sm:px-5",
        "flex flex-col",
        gap === "tight" ? "gap-3" : "gap-4",
        className
      )}
    >
      {children}
    </div>
  );
}
