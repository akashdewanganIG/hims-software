"use client";

import { toast as sonner } from "sonner";

type ToastOptions = {
  description?: string;
  duration?: number;
  id?: string | number;
  /** A button in the toast, e.g. "Print bill". */
  action?: { label: string; onClick: () => void };
};

export function errorMessage(
  error: unknown,
  fallback = "Something went wrong"
) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}

/** Same surface as the Ralli Wolf toast helper, minus the HTTP parsing. */
export const toast = {
  success(title: string, options: ToastOptions = {}) {
    return sonner.success(title, options);
  },
  error(error: unknown, fallbackTitle = "Action not allowed") {
    const message = errorMessage(error);
    return sonner.error(fallbackTitle, { description: message });
  },
  info(title: string, options: ToastOptions = {}) {
    return sonner.info(title, options);
  },
  warning(title: string, options: ToastOptions = {}) {
    return sonner.warning(title, options);
  },
};
