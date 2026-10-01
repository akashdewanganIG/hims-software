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
import { AlertTriangle, ArrowRightLeft } from "@/components/icons";

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
}: ConfirmationDialogProps) {
  const [isProcessing, setIsProcessing] = React.useState(false);

  const busy = isProcessing || isLoading;

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
            {variant === "destructive" ? (
              <AlertTriangle className="h-6 w-6 text-destructive" />
            ) : (
              <ArrowRightLeft className="h-6 w-6 text-primary" />
            )}
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
