"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { X } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Side drawer for record detail and quick actions. Same surface, header,
 * footer and overlay language as `Dialog`; it only enters from the right.
 */
const Sheet = DialogPrimitive.Root;

const SIZES = {
  md: "sm:max-w-md",
  lg: "sm:max-w-xl",
  xl: "sm:max-w-3xl",
} as const;

function SheetContent({
  className,
  children,
  size = "lg",
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  size?: keyof typeof SIZES;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l border-border bg-surface shadow-xl shadow-black/10 outline-none duration-200",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          SIZES[size],
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-[background-color,color] duration-150 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30">
          <X className="size-3.5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "shrink-0 border-b border-border px-4 py-3 pr-12 sm:px-5 sm:py-4",
        className
      )}
      {...props}
    />
  );
}

function SheetBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5",
        className
      )}
      {...props}
    />
  );
}

function SheetFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end sm:px-5",
        className
      )}
      {...props}
    />
  );
}

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-sm font-semibold leading-5 tracking-tight text-foreground",
      className
    )}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("mt-0.5 text-xs leading-4 text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";

export {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
