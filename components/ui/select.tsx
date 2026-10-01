"use client";

import * as React from "react";
import * as RadixSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
  controlVariants,
  type ControlSize,
} from "@/components/ui/form-control";
import { MENU_ITEM, MENU_ITEM_ACTIVE } from "@/components/ui/form-control";

const Select = RadixSelect.Root;

const SelectValue = React.forwardRef<
  React.ElementRef<typeof RadixSelect.Value>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Value>
>(({ placeholder = "Select an option", ...props }, ref) => (
  <RadixSelect.Value ref={ref} placeholder={placeholder} {...props} />
));
SelectValue.displayName = RadixSelect.Value.displayName;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof RadixSelect.Trigger>,
  Omit<React.ComponentPropsWithoutRef<typeof RadixSelect.Trigger>, "size"> & {
    size?: ControlSize;
  }
>(({ className, children, size, ...props }, ref) => (
  <RadixSelect.Trigger
    ref={ref}
    data-slot="select-trigger"
    className={cn(
      controlVariants({ size }),
      "group flex items-center justify-between gap-2 text-left hover:border-border data-[placeholder]:text-muted-foreground data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20 [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left",
      className
    )}
    {...props}
  >
    {children}
    <RadixSelect.Icon asChild>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
    </RadixSelect.Icon>
  </RadixSelect.Trigger>
));
SelectTrigger.displayName = RadixSelect.Trigger.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof RadixSelect.Content>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Content>
>(
  (
    { className, children, position = "popper", sideOffset = 6, ...props },
    ref
  ) => (
    <RadixSelect.Portal>
      <RadixSelect.Content
        ref={ref}
        className={cn(
          "z-50 min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border/80 bg-popover/95 text-popover-foreground shadow-xl shadow-black/10 backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
          className
        )}
        position={position}
        {...(position === "popper" ? { sideOffset } : {})}
        {...props}
      >
        <RadixSelect.Viewport className="max-h-[min(20rem,var(--radix-select-content-available-height))] overflow-y-auto p-1">
          {children}
        </RadixSelect.Viewport>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  )
);
SelectContent.displayName = RadixSelect.Content.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof RadixSelect.Item>,
  React.ComponentPropsWithoutRef<typeof RadixSelect.Item>
>(({ className, children, ...props }, ref) => (
  <RadixSelect.Item
    ref={ref}
    className={cn(
      MENU_ITEM,
      MENU_ITEM_ACTIVE,
      "mb-px pl-8 pr-2.5 last:mb-0",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <RadixSelect.ItemIndicator>
        <Check className="h-4 w-4" />
      </RadixSelect.ItemIndicator>
    </span>
    <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
  </RadixSelect.Item>
));
SelectItem.displayName = RadixSelect.Item.displayName;

export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem };
