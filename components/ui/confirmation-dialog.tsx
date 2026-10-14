"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRightLeft,
  type IconComponent,
} from "@/components/icons";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmText?: string;
  variant?: "default" | "destructive";
  isLoading?: boolean;
  disabled?: boolean;
  /** Replaces the variant's default icon. */
  icon?: IconComponent;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  variant = "default",
  isLoading = false,
  disabled = false,
  icon,
}: ConfirmationDialogProps) {
  const [isProcessing, setIsProcessing] = React.useState(false);

  const busy = isProcessing || isLoading;
  const Icon =
    icon ?? (variant === "destructive" ? AlertTriangle : ArrowRightLeft);

  const handleConfirm = async () => {
    if (busy || disabled) return;

    setIsProcessing(true);
    try {
      await onConfirm();

      onOpenChange(false);
    } catch {
      return;
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[26.5625rem]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Icon
              className={cn(
                "h-6 w-6 shrink-0",
                variant === "destructive" ? "text-destructive" : "text-primary"
              )}
            />
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription className="text-left">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy || disabled}
          >
            Cancel
          </Button>
          <Button
            variant={variant}
            onClick={handleConfirm}
            disabled={busy || disabled}
          >
            {busy ? "Processing…" : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
