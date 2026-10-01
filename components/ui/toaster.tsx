"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "@/components/icons";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      offset={16}
      gap={8}
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-info" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-error" />,
        loading: (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        ),
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: [
            "group/toast relative flex w-full items-start gap-2.5 overflow-hidden",
            "rounded-lg border py-3 pl-3.5 pr-9",

            "border-border bg-popover text-popover-foreground",

            "shadow-[0_1px_2px_rgba(16,24,40,0.05),0_8px_20px_-8px_rgba(16,24,40,0.16)]",

            "data-[type=success]:border-success-border data-[type=success]:bg-success-surface",
            "data-[type=warning]:border-warning-border data-[type=warning]:bg-warning-surface",
            "data-[type=error]:border-error-border data-[type=error]:bg-error-surface",
            "data-[type=info]:border-info-border data-[type=info]:bg-info-surface",
          ].join(" "),
          icon: [
            "mt-0.5 flex shrink-0 items-center justify-center",

            "group-data-[type=loading]/toast:order-last group-data-[type=loading]/toast:mt-0 group-data-[type=loading]/toast:self-center group-data-[type=loading]/toast:pl-1",
          ].join(" "),

          loader:
            "static! transform-none! flex size-4 items-center justify-center",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: [
            "text-[0.8125rem] font-semibold leading-5 tracking-[-0.006em]",
            "group-data-[type=success]/toast:text-success-foreground",
            "group-data-[type=warning]/toast:text-warning-foreground",
            "group-data-[type=error]/toast:text-error-foreground",
            "group-data-[type=info]/toast:text-info-foreground",
          ].join(" "),

          description:
            "text-[0.75rem] leading-[1.45] text-foreground/70 [&_strong]:font-medium [&_strong]:text-foreground",

          actionButton:
            "ml-2 shrink-0 self-center rounded-md border border-foreground/15 bg-foreground/[0.06] px-2 py-1 text-[0.75rem] font-medium text-foreground transition-colors hover:bg-foreground/10",
          cancelButton:
            "ml-1 shrink-0 self-center rounded-md px-2 py-1 text-[0.75rem] font-medium text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground",
          closeButton: [
            "absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-md",
            "border-none bg-transparent text-foreground opacity-0",
            "transition-[opacity,background-color] hover:bg-foreground/10",
            "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
            "group-hover/toast:opacity-100",

            "[&>svg]:size-3.5 [&>svg]:opacity-60 [&>svg]:transition-opacity hover:[&>svg]:opacity-100",
          ].join(" "),
        },
      }}
      style={
        {
          "--width": "356px",

          "--normal-bg": "transparent",
          "--normal-bg-hover":
            "color-mix(in srgb, var(--foreground) 10%, transparent)",
          "--normal-border": "transparent",
          "--normal-border-hover": "transparent",
          "--normal-text": "var(--foreground)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
