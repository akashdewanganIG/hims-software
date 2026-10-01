"use client";

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
} as const;

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "lg",
  submitLabel = "Save",
  cancelLabel = "Cancel",
  onSubmit,
  isSubmitting = false,
  submitDisabled = false,
  footerStart,
  bodyClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  size?: keyof typeof SIZES;
  submitLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  /** Extra controls on the left of the Cancel / Submit footer. */
  footerStart?: React.ReactNode;
  bodyClassName?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("gap-0 overflow-hidden", SIZES[size])}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody>
            <div className={cn("grid gap-3", bodyClassName)}>{children}</div>
          </DialogBody>
          <DialogFooter
            className={footerStart ? "sm:justify-between" : undefined}
          >
            {footerStart ? (
              <div className="flex flex-wrap gap-2">{footerStart}</div>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                {cancelLabel}
              </Button>
              <Button
                type="submit"
                variant="raised"
                disabled={isSubmitting || submitDisabled}
              >
                {isSubmitting ? "Saving…" : submitLabel}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
