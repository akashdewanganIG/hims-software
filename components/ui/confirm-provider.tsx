"use client";

import * as React from "react";

import { AlertCircle, type IconComponent } from "@/components/icons";
import { ConfirmationDialog } from "./confirmation-dialog";

export interface ConfirmRequest {
  title: string;
  description: string;
  confirmText?: string;
  variant?: "default" | "destructive";
  icon?: IconComponent;
  /**
   * Runs on confirm. Return the mutation's promise (`mutateAsync()`) so the
   * dialog stays open, busy, until it settles — and stays open if it fails.
   */
  onConfirm: () => unknown;
}

const ConfirmContext = React.createContext<
  ((request: ConfirmRequest) => void) | null
>(null);

/**
 * One shared confirmation dialog for actions a misclick should not trigger:
 * `useConfirm()` opens it with the request's wording, so a screen needs no
 * open state of its own per action.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  // Kept after closing so the dialog's text holds through its exit animation.
  const [request, setRequest] = React.useState<ConfirmRequest | null>(null);

  const confirm = React.useCallback((next: ConfirmRequest) => {
    setRequest(next);
    setOpen(true);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request ? (
        <ConfirmationDialog
          open={open}
          onOpenChange={setOpen}
          title={request.title}
          description={request.description}
          confirmText={request.confirmText}
          variant={request.variant}
          icon={
            request.icon ??
            (request.variant === "destructive" ? undefined : AlertCircle)
          }
          onConfirm={async () => {
            await request.onConfirm();
          }}
        />
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = React.useContext(ConfirmContext);
  if (!confirm)
    throw new Error("useConfirm must be used inside <ConfirmProvider>.");
  return confirm;
}
