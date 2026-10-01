"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CardActionButton({
  href,
  children,
  className,
  ...props
}: {
  href?: string;
  children: React.ReactNode;
  className?: string;
} & Omit<React.ComponentProps<typeof Button>, "variant" | "size" | "asChild">) {
  const classes = cn("mt-auto", className);

  if (href) {
    return (
      <Button
        asChild
        variant="cardAction"
        size="card"
        className={classes}
        {...props}
      >
        <Link href={href}>{children}</Link>
      </Button>
    );
  }

  return (
    <Button variant="cardAction" size="card" className={classes} {...props}>
      {children}
    </Button>
  );
}
