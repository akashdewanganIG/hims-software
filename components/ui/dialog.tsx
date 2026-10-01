"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "@/components/icons";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogPortal = DialogPrimitive.Portal;

let lastFocusOutsideDialog: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    event => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target !== document.body &&
        !target.closest('[role="dialog"]')
      ) {
        lastFocusOutsideDialog = target;
      }
    },
    true
  );
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean;
  }
>(({ className, children, showCloseButton = true, ...props }, ref) => {
  const restoreFocusTo = React.useRef<HTMLElement | null>(null);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        onCloseAutoFocus={event => {
          props.onCloseAutoFocus?.(event);
          if (event.defaultPrevented) return;
          const target = restoreFocusTo.current ?? lastFocusOutsideDialog;

          if (target && document.contains(target)) {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
        data-slot="dialog-content"
        className={cn(
          "fixed inset-0 z-50 m-auto flex h-fit max-h-[calc(100svh-1rem)] w-[calc(100%-1rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-xl border border-border bg-surface p-0 shadow-lg shadow-black/10 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:max-h-[calc(100svh-2rem)] sm:w-[calc(100%-2rem)]",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none transition-[background-color,color] duration-150 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none">
            <X className="size-3.5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn(
      "relative z-10 shrink-0 border-b border-border bg-surface px-4 py-3 pr-12 text-left sm:px-5 sm:py-4 sm:pr-12",
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="dialog-body"
    className={cn(
      "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 sm:py-4",
      className
    )}
    {...props}
  />
));
DialogBody.displayName = "DialogBody";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-footer"
    className={cn(
      "relative z-10 shrink-0 flex flex-col-reverse gap-2 border-t border-border bg-surface px-4 py-3 sm:flex-row sm:justify-end sm:px-5",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
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
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-xs leading-4 text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
